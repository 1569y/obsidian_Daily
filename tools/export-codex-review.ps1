[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$Batch,

    [Parameter(Mandatory = $true)]
    [ValidateSet('pre-commit', 'post-commit')]
    [string]$Mode,

    [Parameter()]
    [string[]]$AllowedPaths = @(),

    [Parameter()]
    [string[]]$Commits = @(),

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$BuildCommand = 'npm run build',

    [Parameter()]
    [switch]$AllowEmptyDiff,

    [Parameter()]
    [switch]$AllowDirtyWorktree
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$script:ForbiddenPathPatterns = @(
    'src/*',
    'main.ts',
    'settings.ts',
    'manifest.json',
    'package.json'
)

function Invoke-GitCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & git @Arguments 2>&1 | ForEach-Object { [string]$_ }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if (-not $AllowFailure -and $exitCode -ne 0) {
        $message = @(
            "git command failed: git $($Arguments -join ' ')",
            "exit code: $exitCode",
            (Convert-LinesToText -Lines $output -EmptyValue '<no output>')
        ) -join [Environment]::NewLine
        throw $message
    }

    return [pscustomobject]@{
        Output   = @($output)
        ExitCode = $exitCode
    }
}

function Invoke-CommandCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & ([scriptblock]::Create($Command)) 2>&1 | ForEach-Object { [string]$_ }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if (-not $AllowFailure -and $exitCode -ne 0) {
        $message = @(
            "command failed: $Command",
            "exit code: $exitCode",
            (Convert-LinesToText -Lines $output -EmptyValue '<no output>')
        ) -join [Environment]::NewLine
        throw $message
    }

    return [pscustomobject]@{
        Output   = @($output)
        ExitCode = $exitCode
    }
}

function Convert-LinesToText {
    param(
        [Parameter()]
        [AllowNull()]
        [object[]]$Lines,

        [Parameter()]
        [string]$EmptyValue = '<none>'
    )

    $items = @($Lines)
    if ($items.Count -eq 0) {
        return $EmptyValue
    }

    return (($items | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).TrimEnd()
}

function Get-ChangedPathsFromNameStatus {
    param(
        [Parameter()]
        [AllowNull()]
        [AllowEmptyCollection()]
        [string[]]$Lines
    )

    $paths = New-Object System.Collections.Generic.List[string]

    foreach ($line in @($Lines)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $parts = $line -split "`t"
        if ($parts.Length -lt 2) {
            continue
        }

        $status = $parts[0]
        if ($status -match '^[RC]' -and $parts.Length -ge 3) {
            $paths.Add($parts[1])
            $paths.Add($parts[2])
            continue
        }

        $paths.Add($parts[1])
    }

    return @($paths | Sort-Object -Unique)
}

function Test-PathMatchesAllowed {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string[]]$Allowed
    )

    foreach ($allowedPath in $Allowed) {
        if ($Path -like $allowedPath) {
            return $true
        }
    }

    return $false
}

function Get-ForbiddenPaths {
    param(
        [Parameter()]
        [AllowNull()]
        [AllowEmptyCollection()]
        [string[]]$Paths
    )

    $matches = New-Object System.Collections.Generic.List[string]

    foreach ($path in @($Paths)) {
        foreach ($pattern in $script:ForbiddenPathPatterns) {
            if ($path -like $pattern) {
                $matches.Add($path)
                break
            }
        }
    }

    return @($matches | Sort-Object -Unique)
}

function Format-Section {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter()]
        [AllowEmptyString()]
        [string]$Body
    )

    return @(
        $Title
        $Body
        ''
    ) -join [Environment]::NewLine
}

function Add-Section {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$Parts,

        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter()]
        [AllowEmptyString()]
        [string]$Body
    )

    $Parts.Add((Format-Section -Title $Title -Body $Body)) | Out-Null
}

function Get-DirtySnapshot {
    $status = Invoke-GitCapture -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
    $unstaged = Invoke-GitCapture -Arguments @('diff', '--name-only')
    $untracked = Invoke-GitCapture -Arguments @('ls-files', '--others', '--exclude-standard')

    return [pscustomobject]@{
        Status    = @($status.Output)
        Unstaged  = @($unstaged.Output)
        Untracked = @($untracked.Output)
    }
}

function Test-CommitChain {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$OrderedCommits
    )

    $results = New-Object System.Collections.Generic.List[object]
    $allPass = $true

    for ($index = 0; $index -lt ($OrderedCommits.Count - 1); $index++) {
        $older = $OrderedCommits[$index]
        $newer = $OrderedCommits[$index + 1]
        $check = Invoke-GitCapture -Arguments @('merge-base', '--is-ancestor', $older, $newer) -AllowFailure
        $isAncestor = $check.ExitCode -eq 0

        if (-not $isAncestor) {
            $allPass = $false
        }

        $results.Add([pscustomobject]@{
            Older    = $older
            Newer    = $newer
            Passed   = $isAncestor
            ExitCode = $check.ExitCode
            Output   = @($check.Output)
        }) | Out-Null
    }

    return [pscustomobject]@{
        Passed = $allPass
        Checks = @($results)
    }
}

function Get-BundleArtifactFileName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BundleId,

        [Parameter(Mandatory = $true)]
        [string]$BaseName
    )

    return '{0}__{1}' -f $BundleId, $BaseName
}

function Get-BundleCommitPatchFileName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BundleId,

        [Parameter(Mandatory = $true)]
        [int]$CommitIndex,

        [Parameter(Mandatory = $true)]
        [string]$ShortSha
    )

    return '{0}__commit-{1}__{2}.patch' -f $BundleId, $CommitIndex.ToString('00'), $ShortSha
}

$scriptExitCode = 1
$locationPushed = $false
$invocationDirectory = (Get-Location).ProviderPath

try {
    if ($Batch -eq '.' -or $Batch -eq '..' -or $Batch.Contains('..')) {
        throw 'Batch must not be "." or ".." and must not contain ".." path-traversal segments.'
    }

    if ($Mode -eq 'post-commit' -and @($Commits).Count -lt 1) {
        throw 'post-commit mode requires at least one value in -Commits.'
    }

    $bundleTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $bundleId = '{0}__{1}__{2}' -f $bundleTimestamp, $Batch, $Mode
    $reviewRoot = [System.IO.Path]::GetFullPath((Join-Path $env:TEMP 'moodnest-review'))
    $reviewRootWithSeparator = $reviewRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $bundleDir = [System.IO.Path]::GetFullPath((Join-Path $reviewRoot $bundleId))
    $reviewSummaryFileName = Get-BundleArtifactFileName -BundleId $bundleId -BaseName 'review-summary.txt'
    $changesPatchFileName = Get-BundleArtifactFileName -BundleId $bundleId -BaseName 'changes.patch'
    $buildFileName = Get-BundleArtifactFileName -BundleId $bundleId -BaseName 'build.txt'
    $combinedPatchFileName = Get-BundleArtifactFileName -BundleId $bundleId -BaseName 'combined.patch'

    if (-not $bundleDir.StartsWith($reviewRootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Resolved bundle directory escapes the review root.`nReview root: $reviewRootWithSeparator`nResolved bundle: $bundleDir"
    }

    if (Test-Path -LiteralPath $bundleDir) {
        throw "bundle directory already exists: $bundleDir`nUse a new unique -Batch value."
    }

    New-Item -ItemType Directory -Path $reviewRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $bundleDir | Out-Null

    $repoRootResult = Invoke-GitCapture -Arguments @('rev-parse', '--show-toplevel') -AllowFailure
    if ($repoRootResult.ExitCode -ne 0) {
        throw "Unable to resolve repository root.`n$(Convert-LinesToText -Lines $repoRootResult.Output -EmptyValue '<no output>')"
    }

    $repositoryRoot = [System.IO.Path]::GetFullPath((Convert-LinesToText -Lines $repoRootResult.Output -EmptyValue '').Trim())
    if ([string]::IsNullOrWhiteSpace($repositoryRoot)) {
        throw 'Repository root resolved to an empty path.'
    }

    Push-Location -LiteralPath $repositoryRoot
    $locationPushed = $true

    $timestamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
    $generatedFiles = New-Object System.Collections.Generic.List[string]
    $summaryParts = New-Object System.Collections.Generic.List[string]
    $reviewPassed = $true
    $diffCheckPassed = $true
    $forbiddenDetected = $false
    $requiresHigherRiskReview = $false

    $head = Invoke-GitCapture -Arguments @('rev-parse', 'HEAD')
    $preBuildSnapshot = Get-DirtySnapshot

    Add-Section -Parts $summaryParts -Title 'Batch' -Body $Batch
    Add-Section -Parts $summaryParts -Title 'Mode' -Body $Mode
    Add-Section -Parts $summaryParts -Title 'Bundle Timestamp' -Body $bundleTimestamp
    Add-Section -Parts $summaryParts -Title 'Bundle ID' -Body $bundleId
    Add-Section -Parts $summaryParts -Title 'Bundle Directory' -Body $bundleDir
    Add-Section -Parts $summaryParts -Title 'Timestamp' -Body $timestamp
    Add-Section -Parts $summaryParts -Title 'Invocation Directory' -Body $invocationDirectory
    Add-Section -Parts $summaryParts -Title 'Repository Root' -Body $repositoryRoot
    Add-Section -Parts $summaryParts -Title 'Current HEAD' -Body (Convert-LinesToText -Lines $head.Output)
    Add-Section -Parts $summaryParts -Title 'Worktree Status' -Body (Convert-LinesToText -Lines $preBuildSnapshot.Status -EmptyValue '<clean>')

    if ($Mode -eq 'pre-commit') {
        $cachedNameStatus = Invoke-GitCapture -Arguments @('diff', '--cached', '--name-status', '--no-color')
        $cachedSummary = Invoke-GitCapture -Arguments @('diff', '--cached', '--summary', '--no-color')
        $cachedStat = Invoke-GitCapture -Arguments @('diff', '--cached', '--stat', '--no-color')
        $cachedNumstat = Invoke-GitCapture -Arguments @('diff', '--cached', '--numstat', '--no-color')
        $cachedCheck = Invoke-GitCapture -Arguments @('diff', '--cached', '--check') -AllowFailure
        $cachedPatch = Invoke-GitCapture -Arguments @('diff', '--cached', '--binary', '--no-color')

        $stagedPaths = Get-ChangedPathsFromNameStatus -Lines $cachedNameStatus.Output
        $unexpectedPaths = @()
        if (@($AllowedPaths).Count -gt 0) {
            $unexpectedPaths = @(
                foreach ($path in $stagedPaths) {
                    if (-not (Test-PathMatchesAllowed -Path $path -Allowed $AllowedPaths)) {
                        $path
                    }
                }
            ) | Sort-Object -Unique
        }

        $forbiddenPaths = Get-ForbiddenPaths -Paths $stagedPaths
        $forbiddenDetected = @($forbiddenPaths).Count -gt 0
        $requiresHigherRiskReview = $forbiddenDetected

        $hasStagedChanges = @($stagedPaths).Count -gt 0
        $hasDirtyWorktree = (@($preBuildSnapshot.Unstaged).Count -gt 0) -or (@($preBuildSnapshot.Untracked).Count -gt 0)
        $diffCheckPassed = $cachedCheck.ExitCode -eq 0
        $allowedPathsPassed = (@($AllowedPaths).Count -eq 0) -or (@($unexpectedPaths).Count -eq 0)
        $emptyDiffPassed = $hasStagedChanges -or $AllowEmptyDiff.IsPresent
        $dirtyWorktreePassed = (-not $hasDirtyWorktree) -or $AllowDirtyWorktree.IsPresent

        $stagedStatusText = if ($hasStagedChanges) { 'Staged changes detected.' } else { 'No staged changes were present.' }
        $dirtyWorktreeGateText = if ($dirtyWorktreePassed) {
            if ($hasDirtyWorktree) { 'PASS via -AllowDirtyWorktree.' } else { 'PASS' }
        } else {
            'FAIL'
        }
        $emptyDiffGateText = if ($emptyDiffPassed) {
            if (-not $hasStagedChanges) { 'PASS via -AllowEmptyDiff.' } else { 'PASS' }
        } else {
            'FAIL'
        }
        $diffCheckText = if ($diffCheckPassed) {
            'PASS'
        } else {
            @(
                'FAIL'
                (Convert-LinesToText -Lines $cachedCheck.Output -EmptyValue '<no diff-check output>')
            ) -join [Environment]::NewLine
        }
        $allowedPathText = if (@($AllowedPaths).Count -eq 0) {
            'AllowedPaths not provided.'
        } elseif ($allowedPathsPassed) {
            'PASS'
        } else {
            @(
                'FAIL'
                'Unexpected staged paths detected:'
                ($unexpectedPaths -join [Environment]::NewLine)
            ) -join [Environment]::NewLine
        }
        $forbiddenPathText = if ($forbiddenDetected) {
            @(
                'Forbidden runtime paths detected. This batch requires higher-risk review.'
                ($forbiddenPaths -join [Environment]::NewLine)
            ) -join [Environment]::NewLine
        } else {
            'No forbidden runtime paths detected in staged changes.'
        }

        if (-not $diffCheckPassed -or -not $allowedPathsPassed -or -not $emptyDiffPassed -or -not $dirtyWorktreePassed) {
            $reviewPassed = $false
        }

        ($cachedPatch.Output | Out-String) | Out-File -FilePath (Join-Path $bundleDir $changesPatchFileName) -Encoding utf8
        $generatedFiles.Add($changesPatchFileName) | Out-Null

        Add-Section -Parts $summaryParts -Title 'Staged Status' -Body $stagedStatusText
        Add-Section -Parts $summaryParts -Title 'Staged File List' -Body (Convert-LinesToText -Lines $cachedNameStatus.Output)
        Add-Section -Parts $summaryParts -Title 'Staged Summary' -Body (Convert-LinesToText -Lines $cachedSummary.Output)
        Add-Section -Parts $summaryParts -Title 'Staged Stat' -Body (Convert-LinesToText -Lines $cachedStat.Output)
        Add-Section -Parts $summaryParts -Title 'Staged Numstat' -Body (Convert-LinesToText -Lines $cachedNumstat.Output)
        Add-Section -Parts $summaryParts -Title 'Unstaged Tracked Paths' -Body (Convert-LinesToText -Lines $preBuildSnapshot.Unstaged)
        Add-Section -Parts $summaryParts -Title 'Untracked Paths' -Body (Convert-LinesToText -Lines $preBuildSnapshot.Untracked)
        Add-Section -Parts $summaryParts -Title 'Dirty Worktree Gate' -Body $dirtyWorktreeGateText
        Add-Section -Parts $summaryParts -Title 'Empty Diff Gate' -Body $emptyDiffGateText
        Add-Section -Parts $summaryParts -Title 'Diff Check Result' -Body $diffCheckText
        Add-Section -Parts $summaryParts -Title 'Allowed Path Check' -Body $allowedPathText
        Add-Section -Parts $summaryParts -Title 'Forbidden Path Findings' -Body $forbiddenPathText
    } else {
        $verifiedCommits = New-Object System.Collections.Generic.List[string]
        $allCommitPaths = New-Object System.Collections.Generic.List[string]
        $commitValidationFailures = New-Object System.Collections.Generic.List[string]

        for ($commitIndex = 0; $commitIndex -lt @($Commits).Count; $commitIndex++) {
            $commit = @($Commits)[$commitIndex]
            $verifySpec = '{0}^{{commit}}' -f $commit
            $verifyCommit = Invoke-GitCapture -Arguments @('rev-parse', '--verify', '--end-of-options', $verifySpec) -AllowFailure
            if ($verifyCommit.ExitCode -ne 0) {
                $reviewPassed = $false
                $commitValidationFailures.Add("Failed to verify commit object: $commit") | Out-Null
                continue
            }

            $resolvedCommit = (Convert-LinesToText -Lines $verifyCommit.Output -EmptyValue '').Trim()
            $verifiedCommits.Add($resolvedCommit) | Out-Null

            $commitPatch = Invoke-GitCapture -Arguments @('show', '--no-color', '--binary', '--stat', '--name-status', '--patch', $resolvedCommit)
            $commitShow = Invoke-GitCapture -Arguments @('show', '--no-color', '--format=fuller', '--stat', '--name-status', '--summary', $resolvedCommit)
            $commitTree = Invoke-GitCapture -Arguments @('diff-tree', '--no-commit-id', '--name-status', '-r', $resolvedCommit)
            $commitNumstat = Invoke-GitCapture -Arguments @('diff-tree', '--no-commit-id', '--numstat', '-r', $resolvedCommit)
            $commitCheck = Invoke-GitCapture -Arguments @('diff', '--check', ($resolvedCommit + '^'), $resolvedCommit) -AllowFailure

            $shortSha = $resolvedCommit.Substring(0, [Math]::Min(7, $resolvedCommit.Length))
            $commitPatchFileName = Get-BundleCommitPatchFileName -BundleId $bundleId -CommitIndex ($commitIndex + 1) -ShortSha $shortSha
            ($commitPatch.Output | Out-String) | Out-File -FilePath (Join-Path $bundleDir $commitPatchFileName) -Encoding utf8
            $generatedFiles.Add($commitPatchFileName) | Out-Null

            $commitPaths = Get-ChangedPathsFromNameStatus -Lines $commitTree.Output
            foreach ($path in $commitPaths) {
                $allCommitPaths.Add($path) | Out-Null
            }

            if ($commitCheck.ExitCode -ne 0) {
                $reviewPassed = $false
                $diffCheckPassed = $false
            }

            $commitCheckSummary = if ($commitCheck.ExitCode -eq 0) {
                'PASS'
            } else {
                @(
                    'FAIL'
                    (Convert-LinesToText -Lines $commitCheck.Output -EmptyValue '<no diff-check output>')
                ) -join [Environment]::NewLine
            }

            Add-Section -Parts $summaryParts -Title ("Commit Reviewed: {0}" -f $resolvedCommit) -Body (
                @(
                    'Fuller Summary:'
                    (Convert-LinesToText -Lines $commitShow.Output)
                    ''
                    'Changed Files:'
                    (Convert-LinesToText -Lines $commitTree.Output)
                    ''
                    'Numstat:'
                    (Convert-LinesToText -Lines $commitNumstat.Output)
                    ''
                    'Diff Check:'
                    $commitCheckSummary
                ) -join [Environment]::NewLine
            )
        }

        if (@($commitValidationFailures).Count -gt 0) {
            Add-Section -Parts $summaryParts -Title 'Commit Verification Failures' -Body ($commitValidationFailures -join [Environment]::NewLine)
        }

        $allReviewedPaths = @($allCommitPaths | Sort-Object -Unique)
        $forbiddenPaths = Get-ForbiddenPaths -Paths $allReviewedPaths
        $forbiddenDetected = @($forbiddenPaths).Count -gt 0
        $requiresHigherRiskReview = $forbiddenDetected
        $forbiddenCommitText = if ($forbiddenDetected) {
            @(
                'Forbidden runtime paths detected. This batch requires higher-risk review.'
                ($forbiddenPaths -join [Environment]::NewLine)
            ) -join [Environment]::NewLine
        } else {
            'No forbidden runtime paths detected in reviewed commits.'
        }

        $unexpectedReviewedPaths = @()
        $postCommitAllowedPathsPassed = $true
        if (@($AllowedPaths).Count -gt 0) {
            $unexpectedReviewedPaths = @(
                foreach ($path in $allReviewedPaths) {
                    if (-not (Test-PathMatchesAllowed -Path $path -Allowed $AllowedPaths)) {
                        $path
                    }
                }
            ) | Sort-Object -Unique
            $postCommitAllowedPathsPassed = @($unexpectedReviewedPaths).Count -eq 0
            if (-not $postCommitAllowedPathsPassed) {
                $reviewPassed = $false
            }
        }

        Add-Section -Parts $summaryParts -Title 'Commits Reviewed' -Body (Convert-LinesToText -Lines $verifiedCommits)
        $postCommitAllowedPathText = if (@($AllowedPaths).Count -eq 0) {
            'AllowedPaths not provided.'
        } elseif ($postCommitAllowedPathsPassed) {
            'PASS'
        } else {
            'FAIL'
        }
        $unexpectedReviewedPathsText = if (@($AllowedPaths).Count -eq 0) {
            'AllowedPaths not provided.'
        } else {
            Convert-LinesToText -Lines $unexpectedReviewedPaths
        }
        Add-Section -Parts $summaryParts -Title 'Post-Commit Allowed Path Check' -Body $postCommitAllowedPathText
        Add-Section -Parts $summaryParts -Title 'Unexpected Reviewed Paths' -Body $unexpectedReviewedPathsText

        $commitOrderPassed = $true
        if (@($verifiedCommits).Count -gt 1) {
            $commitChain = Test-CommitChain -OrderedCommits @($verifiedCommits)
            $commitOrderPassed = $commitChain.Passed
            $commitOrderStatus = if ($commitOrderPassed) { 'PASS' } else { 'FAIL' }
            if (-not $commitOrderPassed) {
                $reviewPassed = $false
            }

            $commitChainDetails = if (@($commitChain.Checks).Count -eq 0) {
                '<single commit>'
            } else {
                @(
                    foreach ($check in $commitChain.Checks) {
                        $statusText = if ($check.Passed) { 'PASS' } else { 'FAIL' }
                        $detail = Convert-LinesToText -Lines $check.Output -EmptyValue '<no output>'
                        "{0} -> {1}: {2} (exit {3}) {4}" -f $check.Older, $check.Newer, $statusText, $check.ExitCode, $detail
                    }
                ) -join [Environment]::NewLine
            }

            Add-Section -Parts $summaryParts -Title 'Commit Order Gate' -Body (
                @(
                    $commitOrderStatus
                    'Supplied commits must be oldest-to-newest on one ancestor chain.'
                    $commitChainDetails
                ) -join [Environment]::NewLine
            )

            if ($commitOrderPassed) {
                $firstParent = Invoke-GitCapture -Arguments @('rev-parse', ($verifiedCommits[0] + '^'))
                $combinedBase = (Convert-LinesToText -Lines $firstParent.Output -EmptyValue '').Trim()
                $combinedPatch = Invoke-GitCapture -Arguments @('diff', '--no-color', '--binary', $combinedBase, $verifiedCommits[$verifiedCommits.Count - 1])
                $combinedCheck = Invoke-GitCapture -Arguments @('diff', '--check', $combinedBase, $verifiedCommits[$verifiedCommits.Count - 1]) -AllowFailure

                ($combinedPatch.Output | Out-String) | Out-File -FilePath (Join-Path $bundleDir $combinedPatchFileName) -Encoding utf8
                $generatedFiles.Add($combinedPatchFileName) | Out-Null

                if ($combinedCheck.ExitCode -ne 0) {
                    $reviewPassed = $false
                    $diffCheckPassed = $false
                }

                $combinedCheckSummary = if ($combinedCheck.ExitCode -eq 0) {
                    'PASS'
                } else {
                    @(
                        'FAIL'
                        (Convert-LinesToText -Lines $combinedCheck.Output -EmptyValue '<no diff-check output>')
                    ) -join [Environment]::NewLine
                }

                Add-Section -Parts $summaryParts -Title 'Combined Range' -Body (
                    @(
                        "First supplied commit parent: $combinedBase"
                        "Last supplied commit: $($verifiedCommits[$verifiedCommits.Count - 1])"
                        'Combined patch spans the first supplied commit parent through the last supplied commit.'
                        'Intervening commits on that ancestry path are included.'
                        'Combined Diff Check:'
                        $combinedCheckSummary
                    ) -join [Environment]::NewLine
                )
            } else {
                Add-Section -Parts $summaryParts -Title 'Combined Range' -Body 'Skipped because supplied commits were not ordered oldest-to-newest on one ancestor chain.'
            }
        }

        Add-Section -Parts $summaryParts -Title 'Forbidden Path Findings' -Body $forbiddenCommitText
    }

    $buildResult = Invoke-CommandCapture -Command $BuildCommand -AllowFailure
    ($buildResult.Output | Out-String) | Out-File -FilePath (Join-Path $bundleDir $buildFileName) -Encoding utf8
    $generatedFiles.Add($buildFileName) | Out-Null

    if ($buildResult.ExitCode -ne 0) {
        $reviewPassed = $false
    }

    $postBuildSnapshot = Get-DirtySnapshot
    $postBuildDirty = (@($postBuildSnapshot.Unstaged).Count -gt 0) -or (@($postBuildSnapshot.Untracked).Count -gt 0)
    $postBuildDirtyGatePassed = (-not $postBuildDirty) -or $AllowDirtyWorktree.IsPresent
    if (-not $postBuildDirtyGatePassed) {
        $reviewPassed = $false
    }

    $postBuildDirtyGateText = if ($postBuildDirtyGatePassed) {
        if ($postBuildDirty) {
            'PASS via -AllowDirtyWorktree.'
        } else {
            'PASS'
        }
    } else {
        'FAIL'
    }

    Add-Section -Parts $summaryParts -Title 'Post-Build Worktree Status' -Body (Convert-LinesToText -Lines $postBuildSnapshot.Status -EmptyValue '<clean>')
    Add-Section -Parts $summaryParts -Title 'Post-Build Unstaged Tracked Paths' -Body (Convert-LinesToText -Lines $postBuildSnapshot.Unstaged)
    Add-Section -Parts $summaryParts -Title 'Post-Build Untracked Paths' -Body (Convert-LinesToText -Lines $postBuildSnapshot.Untracked)
    Add-Section -Parts $summaryParts -Title 'Post-Build Dirty Worktree Gate' -Body $postBuildDirtyGateText
    Add-Section -Parts $summaryParts -Title 'Requires Higher-Risk Review' -Body ([string]$requiresHigherRiskReview)
    Add-Section -Parts $summaryParts -Title 'Build Command' -Body $BuildCommand
    Add-Section -Parts $summaryParts -Title 'Build Exit Code' -Body ([string]$buildResult.ExitCode)
    $reviewGateText = if ($reviewPassed) { 'PASS' } else { 'FAIL' }
    Add-Section -Parts $summaryParts -Title 'Review Gate Result' -Body $reviewGateText

    ($summaryParts -join [Environment]::NewLine) | Out-File -FilePath (Join-Path $bundleDir $reviewSummaryFileName) -Encoding utf8
    $generatedFiles.Add($reviewSummaryFileName) | Out-Null

    Write-Host "Bundle directory: $bundleDir"
    Write-Host "Bundle ID: $bundleId"
    Write-Host 'Generated files:'
    foreach ($file in ($generatedFiles | Sort-Object)) {
        Write-Host "- $file"
    }
    Write-Host "Build exit code: $($buildResult.ExitCode)"
    Write-Host "Diff-check passed: $diffCheckPassed"
    Write-Host "Forbidden paths detected: $forbiddenDetected"
    Write-Host "Requires higher-risk review: $requiresHigherRiskReview"
    Write-Host "Review gate passed: $reviewPassed"

    if ($reviewPassed) {
        $scriptExitCode = 0
    }
}
catch {
    Write-Error $_
    $scriptExitCode = 1
}
finally {
    if ($locationPushed) {
        Pop-Location
    }
}

exit $scriptExitCode
