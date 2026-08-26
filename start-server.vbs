Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d c:\Users\salad\Desktop\kiwoom-quant-dashboard && pnpm dev", 1, False
WScript.Sleep 3000
WshShell.Run "http://localhost:3000", 1, False
