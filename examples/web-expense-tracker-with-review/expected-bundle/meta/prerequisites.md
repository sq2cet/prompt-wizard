# Prerequisites — verify before you start

Run each verification command below in a terminal. If any fails, install the tool using the command for your operating system.

## Git
- Verify: `git --version`
- Install (macOS): `xcode-select --install`
- Install (Windows): `winget install Git.Git`
- Install (Linux): `sudo apt install git`

## Node.js
- Required version: `>=20`
- Verify: `node --version`
- Install (macOS): `brew install node`
- Install (Windows): `winget install OpenJS.NodeJS`
- Install (Linux): `sudo apt install nodejs npm`
- Notes:
  - Behind a TLS-inspecting proxy, set NODE_EXTRA_CA_CERTS to the proxy's CA bundle.
  - Endpoint AV may scan node_modules during install; first install can be slow.
