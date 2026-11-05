$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android-app'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$python = (Get-Command python.exe -ErrorAction Stop).Source

$javaVersion = (java -version 2>&1 | Out-String)
if ($javaVersion -notmatch 'version "(?<major>\d+)' -or [int]$Matches.major -lt 17) {
    $bundledJdk = 'D:/JetBrains/PyCharm Community Edition 2024.3/jbr'
    if (-not (Test-Path (Join-Path $bundledJdk 'bin/java.exe'))) { throw '需要 JDK 17 或更新版本。' }
    $env:JAVA_HOME = $bundledJdk
}
$env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
Set-Content -LiteralPath (Join-Path $androidRoot 'local.properties') -Value "sdk.dir=$($sdkRoot.Replace('\','/'))" -Encoding ascii

& $python (Join-Path $projectRoot 'tools/build_android.py')
if ($LASTEXITCODE -ne 0) { throw '同步 Android 资源失败。' }
Push-Location $androidRoot
try {
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'APK 编译失败。' }
} finally { Pop-Location }

$apk = Join-Path $androidRoot 'app/build/outputs/apk/debug/app-debug.apk'
$output = Join-Path $projectRoot '留墨-Android.apk'
Copy-Item -LiteralPath $apk -Destination $output -Force
Write-Output "APK: $output"
