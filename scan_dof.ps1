$dof = "D:\Terrapixa Dropbox\clement ver eecke\ARO\PIX"

Write-Output "=== MasterDarks ==="
Get-ChildItem "$dof\MasterDarks" -File | Select-Object -ExpandProperty Name

Write-Output "`n=== MasterFlats ==="
Get-ChildItem "$dof\MasterFlats" -File | Select-Object -ExpandProperty Name

Write-Output "`n=== MasterBias ==="
Get-ChildItem "$dof\MasterBias" -File | Select-Object -ExpandProperty Name
