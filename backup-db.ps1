# backup-db.ps1
# Dùng khi muốn backup toàn bộ DB ra thư mục DataDB

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupFile = "C:\rapphim\source\rapphim\DataDB\rapphim_backup_$timestamp.sql"

Write-Host "🗄️  Đang backup database..." -ForegroundColor Cyan
docker exec rapphim-db pg_dump -U rapphim rapphim > $backupFile

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $backupFile).Length / 1MB
    Write-Host "✅ Backup thành công!" -ForegroundColor Green
    Write-Host "   File: $backupFile" -ForegroundColor Gray
    Write-Host "   Size: $([math]::Round($size, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "❌ Backup thất bại!" -ForegroundColor Red
}
