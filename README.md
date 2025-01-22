# SSH Key Generator

[![npm version](https://img.shields.io/npm/v/generate-ssh-key.svg)](https://www.npmjs.com/package/generate-ssh-key)
[![npm downloads](https://img.shields.io/npm/dm/generate-ssh-key.svg)](https://www.npmjs.com/package/generate-ssh-key)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate a secure SSH key and configure Git with one command

## Usage

```bash
npx generate-ssh-key
```

## Features

- 🔑 Generates ED25519 SSH key pair if one doesn't exist
- 🖥️ Works on Windows, macOS, and Linux
- 📋 Automatically copies public key to clipboard
- 🛠️ Automatically installs OpenSSH on Windows if needed
- 🔒 Sets correct permissions on .ssh directory
- ✨ Checks for Git installation and provides setup instructions
- 👤 Helps configure Git user name and email if missing
- 🔄 Automatically converts repository URLs to SSH format
- 🚀 Automatically uploads key to GitHub if GitHub CLI is installed
- 💡 Provides helpful next steps
