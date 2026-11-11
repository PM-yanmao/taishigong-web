$p = "tools/art_grade.py"
$u8 = New-Object System.Text.UTF8Encoding($false)
$t = [System.IO.File]::ReadAllText((Resolve-Path $p).Path, $u8)
$t = $t.Replace("gamma = 1.0 + (gamma - 1.0) * 0.55 * strength", "gamma = 1.0 + (gamma - 1.0) * 0.75 * strength")
$t = $t.Replace("a = L2 + (a - L2) * (1.0 - 0.14 * strength)", "a = L2 + (a - L2) * (1.0 - 0.20 * strength)")
$t = $t.Replace("a = a + shadow * np.array([-0.014, -0.002, 0.028], np.float32) * strength", "a = a + shadow * np.array([-0.010, -0.001, 0.020], np.float32) * strength")
$t = $t.Replace("a = a + high * np.array([0.020, 0.006, -0.014], np.float32) * strength", "a = a + high * np.array([0.014, 0.004, -0.010], np.float32) * strength")
[System.IO.File]::WriteAllText((Resolve-Path $p).Path, $t, $u8)
Write-Host "grade params updated"
