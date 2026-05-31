New-NetFirewallRule -DisplayName "Image Uploader" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

New-NetFirewallRule -DisplayName "Image Uploader" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

Remove-NetFirewallRule -DisplayName "Image Uploader"

