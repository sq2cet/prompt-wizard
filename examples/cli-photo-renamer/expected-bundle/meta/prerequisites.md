# Prerequisites — verify before you start

Run each verification command below in a terminal. If any fails, install the tool using the command for your operating system.

## Git
- Verify: `git --version`
- Install (macOS): `xcode-select --install`
- Install (Windows): `winget install Git.Git`
- Install (Linux): `sudo apt install git`

## Python
- Required version: `>=3.11`
- Verify: `python3 --version`
- Install (macOS): `brew install python@3.12`
- Install (Windows): `winget install Python.Python.3.12`
- Install (Linux): `sudo apt install python3.12 python3.12-venv`
- Notes:
  - Use a venv per project; avoid touching the system Python.
