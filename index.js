#!/usr/bin/env node

import { exec } from "child_process";
import { promises as fs } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import chalk from "chalk";
import which from "which";

const isWindows = platform() === "win32";
const sshDir = join(homedir(), ".ssh");
const keyPath = join(sshDir, "id_ed25519");
const pubKeyPath = `${keyPath}.pub`;

// Helper function to execute shell commands
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
};

// Check if OpenSSH is already installed on Windows
async function checkWindowsOpenSSH() {
  try {
    const result = await execPromise(
      "powershell.exe -Command \"Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*' | Select-Object -ExpandProperty State\"",
    );
    return result.trim() === "Installed";
  } catch {
    return false;
  }
}

// Check if ssh-keygen is available
async function checkSSHKeygen() {
  try {
    await which("ssh-keygen");
    return true;
  } catch {
    return false;
  }
}

// Install OpenSSH on Windows
async function installWindowsOpenSSH() {
  try {
    console.log(chalk.yellow("Installing OpenSSH..."));
    await execPromise(
      'powershell.exe -Command "Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"',
    );
    console.log(chalk.green("OpenSSH installed successfully!"));
    return true;
  } catch (error) {
    console.error(chalk.red("Failed to install OpenSSH automatically."));
    console.log(chalk.yellow("Please install OpenSSH manually:"));
    console.log(chalk.white("1. Open PowerShell as Administrator"));
    console.log(
      chalk.white(
        "2. Run: Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0",
      ),
    );
    return false;
  }
}

// Ensure .ssh directory exists with correct permissions
async function ensureSSHDirectory() {
  try {
    await fs.mkdir(sshDir, { recursive: true });

    // Set proper permissions
    if (!isWindows) {
      await fs.chmod(sshDir, 0o700);
    } else {
      try {
        await execPromise(
          `icacls "${sshDir}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`,
        );
      } catch {
        console.log(
          chalk.yellow(
            "Warning: Could not set optimal permissions on .ssh directory",
          ),
        );
      }
    }
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw new Error(`Failed to create .ssh directory: ${error.message}`);
    }
  }
}

// Generate SSH key
async function generateKey() {
  try {
    // Check if key already exists
    try {
      await fs.access(keyPath);
      console.log(
        chalk.yellow("SSH key already exists at:"),
        chalk.white(keyPath),
      );
    } catch {
      // Key doesn't exist, generate new one
      console.log(chalk.blue("Generating new ED25519 SSH key..."));

      // Generate key with empty passphrase
      const command = `ssh-keygen -t ed25519 -f "${keyPath}" -N ""`;
      await execPromise(command);
      console.log(chalk.green("SSH key generated successfully!"));
    }

    // Read and display public key
    const publicKey = await fs.readFile(pubKeyPath, "utf8");
    console.log("\n" + chalk.cyan("Your public SSH key:"));
    console.log(chalk.white(publicKey));

    // Copy to clipboard if possible
    try {
      const clipCommand = isWindows
        ? `type "${pubKeyPath}" | clip`
        : platform() === "darwin"
          ? `cat "${pubKeyPath}" | pbcopy`
          : `cat "${pubKeyPath}" | xclip -selection clipboard`;

      await execPromise(clipCommand);
      console.log(
        chalk.green("\nPublic key has been copied to your clipboard!"),
      );
    } catch {
      console.log(
        chalk.yellow("\nNote: Could not copy to clipboard automatically"),
      );
    }

    // Show helpful next steps
    console.log(chalk.cyan("\nNext steps:"));
    console.log(chalk.white("1. Add this public key to your GitHub account:"));
    console.log(chalk.white("   https://github.com/settings/ssh/new"));
    console.log(chalk.white("2. Or add it to your GitLab account:"));
    console.log(chalk.white("   https://gitlab.com/-/profile/keys"));
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`);
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.cyan("🔑 SSH Key Generator"));

    // Check if ssh-keygen is available
    if (!(await checkSSHKeygen())) {
      if (isWindows) {
        // Check if OpenSSH is already installed
        const isOpenSSHInstalled = await checkWindowsOpenSSH();
        if (!isOpenSSHInstalled) {
          if (!(await installWindowsOpenSSH())) {
            process.exit(1);
          }
        } else {
          console.error(
            chalk.red(
              "Error: OpenSSH is installed but ssh-keygen is not in PATH",
            ),
          );
          console.log(chalk.yellow("Try restarting your terminal or computer"));
          process.exit(1);
        }
      } else {
        console.error(chalk.red("Error: ssh-keygen not found!"));
        console.log(chalk.yellow("Please install OpenSSH:"));
        if (platform() === "darwin") {
          console.log(chalk.white("Run: brew install openssh"));
        } else {
          console.log(chalk.white("Run: sudo apt-get install openssh-client"));
        }
        process.exit(1);
      }
    }

    await ensureSSHDirectory();
    await generateKey();
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message);
    process.exit(1);
  }
}

main();
