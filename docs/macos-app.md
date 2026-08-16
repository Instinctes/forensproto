# Native macOS app (Apple Silicon)

ForensProto can run as a real `.app` (Tauri window + bundled Next.js server on port `38217`). The project folder is not required after the build.

On a Mac with Xcode Command Line Tools:

```bash
bash packaging/install-forensproto-macos.sh
```

That installs missing tools (Homebrew, Node, Hashcat, Python, optional Ollama, Rust) and builds `ForensProto.app` plus a `.dmg` when the bundler produces one.

```bash
open ForensProto.app
# optional:
# mv ForensProto.app /Applications/
```

Unsigned builds: first launch may need **Right-click → Open**.

Useful flags:

```bash
bash packaging/install-forensproto-macos.sh --skip-ollama
bash packaging/install-forensproto-macos.sh --model=llama3.1
bash packaging/install-forensproto-macos.sh --intel        # x86_64
bash packaging/install-forensproto-macos.sh --universal
bash packaging/install-forensproto-macos.sh --browser-only # skip native wrapper
```

User data for the bundled app goes to `~/Library/Application Support/com.forensproto.desktop`. Hashcat, Node, Python, and Ollama stay system installs — they are not fully embedded in the `.app`.
