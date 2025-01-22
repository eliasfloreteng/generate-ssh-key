#!/usr/bin/env node

import { exec } from "child_process"
import { promises as fs } from "fs"
import { homedir, platform } from "os"
import { join } from "path"
import chalk from "chalk"
import which from "which"
import inquirer from "inquirer"

const isWindows = platform() === "win32"
const sshDir = join(homedir(), ".ssh")
const keyPath = join(sshDir, "id_ed25519")
const pubKeyPath = `${keyPath}.pub`

// Helper function to execute shell commands
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}

// Check if OpenSSH is already installed on Windows
async function checkWindowsOpenSSH() {
  try {
    const result = await execPromise(
      "powershell.exe -Command \"Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*' | Select-Object -ExpandProperty State\""
    )
    return result.trim() === "Installed"
  } catch {
    return false
  }
}

// Check if ssh-keygen is available
async function checkSSHKeygen() {
  try {
    await which("ssh-keygen")
    return true
  } catch {
    return false
  }
}

// Install OpenSSH on Windows
async function installWindowsOpenSSH() {
  try {
    console.log(chalk.yellow("Installing OpenSSH..."))
    await execPromise(
      'powershell.exe -Command "Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"'
    )
    console.log(chalk.green("OpenSSH installed successfully!"))
    return true
  } catch (error) {
    console.error(chalk.red("Failed to install OpenSSH automatically."))
    console.log(chalk.yellow("Please install OpenSSH manually:"))
    console.log(chalk.white("1. Open PowerShell as Administrator"))
    console.log(
      chalk.white(
        "2. Run: Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"
      )
    )
    return false
  }
}

// Ensure .ssh directory exists with correct permissions
async function ensureSSHDirectory() {
  try {
    await fs.mkdir(sshDir, { recursive: true })

    // Set proper permissions
    if (!isWindows) {
      await fs.chmod(sshDir, 0o700)
    } else {
      try {
        await execPromise(
          `icacls "${sshDir}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"`
        )
      } catch {
        console.log(
          chalk.yellow(
            "Warning: Could not set optimal permissions on .ssh directory"
          )
        )
      }
    }
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw new Error(`Failed to create .ssh directory: ${error.message}`)
    }
  }
}

// Generate SSH key
async function generateKey() {
  try {
    // Check if key already exists
    try {
      await fs.access(keyPath)
      console.log(
        chalk.yellow("SSH key already exists at:"),
        chalk.white(keyPath)
      )
    } catch {
      // Key doesn't exist, generate new one
      console.log(chalk.blue("Generating new ED25519 SSH key..."))

      // Generate key with empty passphrase
      const command = `ssh-keygen -t ed25519 -f "${keyPath}" -N ""`
      await execPromise(command)
      console.log(chalk.green("SSH key generated successfully!"))
    }

    // Read and display public key
    const publicKey = await fs.readFile(pubKeyPath, "utf8")
    console.log("\n" + chalk.cyan("Your public SSH key:"))
    console.log(chalk.white(publicKey))

    // Copy to clipboard if possible
    try {
      const clipCommand = isWindows
        ? `type "${pubKeyPath}" | clip`
        : platform() === "darwin"
        ? `cat "${pubKeyPath}" | pbcopy`
        : `cat "${pubKeyPath}" | xclip -selection clipboard`

      await execPromise(clipCommand)
      console.log(
        chalk.green("\nPublic key has been copied to your clipboard!")
      )
    } catch {
      console.log(
        chalk.yellow("\nNote: Could not copy to clipboard automatically")
      )
    }
  } catch (error) {
    throw new Error(`Failed to generate SSH key: ${error.message}`)
  }
}

function showNextSteps() {
  console.log(chalk.cyan("\nNext steps:"))
  console.log(chalk.white("1. Add this public key to your GitHub account:"))
  console.log(chalk.white("   https://github.com/settings/ssh/new"))
  console.log(chalk.white("2. Or add it to your GitLab account:"))
  console.log(chalk.white("   https://gitlab.com/-/profile/keys"))
  console.log(chalk.white("3. Or add it to your GitHub Enterprise account:"))
  console.log(chalk.white("   https://gits-15.sys.kth.se/settings/ssh/new"))

  console.log(chalk.cyan("\nImportant:"))
  console.log(chalk.white("• For new clones, use SSH URLs instead of HTTPS:"))
  console.log(chalk.white("  git clone git@github.com:username/repo.git"))
  console.log(chalk.white("\n• To update existing repositories to use SSH:"))
  console.log(chalk.white("  1. Check current remote URL:"))
  console.log(chalk.white("     git remote -v"))
  console.log(chalk.white("  2. Change remote URL to SSH:"))
  console.log(
    chalk.white(
      "     git remote set-url origin git@github.com:username/repo.git"
    )
  )
}

async function isGitRepo() {
  try {
    await execPromise("git rev-parse --is-inside-work-tree")
    return true
  } catch {
    return false
  }
}

async function getCurrentRemoteUrl() {
  try {
    return await execPromise("git config --get remote.origin.url")
  } catch {
    return null
  }
}

function convertToSshUrl(httpsUrl) {
  const regex = /^https:\/\/(.*?)\/(.*?)\/(.*?)(?:\.git)?$/
  const match = httpsUrl.match(regex)
  if (!match) return null
  const [, domain, username, repo] = match
  return `git@${domain}:${username}/${repo}.git`
}

async function isGitHubCliAvailable() {
  try {
    await which("gh")
    // Check if authenticated
    await execPromise("gh auth status")
    return true
  } catch {
    return false
  }
}

async function uploadKeyToGitHub(pubKeyPath) {
  try {
    const keyTitle = `SSH key generated on ${
      new Date().toISOString().split("T")[0]
    }`
    await execPromise(`gh ssh-key add "${pubKeyPath}" -t "${keyTitle}"`)
    console.log(
      chalk.green("\nSSH key automatically added to your GitHub account!")
    )
    return true
  } catch (error) {
    console.log(
      chalk.yellow("\nFailed to automatically add key to GitHub:"),
      error.message
    )
    return false
  }
}

async function getGitHubUsername() {
  try {
    return await execPromise("gh api user -q .login")
  } catch {
    return null
  }
}

async function checkGitInstalled() {
  try {
    await which("git")
    return true
  } catch {
    return false
  }
}

async function getGitConfig(key) {
  try {
    return await execPromise(`git config --global --get ${key}`)
  } catch {
    return null
  }
}

async function setGitConfig(key, value) {
  await execPromise(`git config --global ${key} "${value}"`)
}

async function setupGitConfig() {
  const name = await getGitConfig("user.name")
  const email = await getGitConfig("user.email")

  if (!name || !email) {
    console.log(chalk.yellow("\nGit user configuration is incomplete."))
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Enter your full name for Git:",
        default: name || "",
        when: !name,
      },
      {
        type: "input",
        name: "email",
        message: "Enter your email for Git:",
        default: email || "",
        when: !email,
      },
    ])

    if (answers.name) {
      await setGitConfig("user.name", answers.name)
      console.log(chalk.green("Git name configured successfully!"))
    }
    if (answers.email) {
      await setGitConfig("user.email", answers.email)
      console.log(chalk.green("Git email configured successfully!"))
    }
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.cyan("🔑 SSH Key Generator"))

    // Check if Git is installed
    if (!(await checkGitInstalled())) {
      console.error(chalk.red("Error: Git is not installed!"))
      console.log(chalk.yellow("Please install Git:"))
      if (isWindows) {
        console.log(
          chalk.white("Download from: https://git-scm.com/download/win")
        )
      } else if (platform() === "darwin") {
        console.log(chalk.white("Run: brew install git"))
      } else {
        console.log(chalk.white("Run: sudo apt-get install git"))
      }
      process.exit(1)
    }

    // Setup Git configuration if needed
    await setupGitConfig()

    // Check if ssh-keygen is available
    if (!(await checkSSHKeygen())) {
      if (isWindows) {
        // Check if OpenSSH is already installed
        const isOpenSSHInstalled = await checkWindowsOpenSSH()
        if (!isOpenSSHInstalled) {
          if (!(await installWindowsOpenSSH())) {
            process.exit(1)
          }
        } else {
          console.error(
            chalk.red(
              "Error: OpenSSH is installed but ssh-keygen is not in PATH"
            )
          )
          console.log(chalk.yellow("Try restarting your terminal or computer"))
          process.exit(1)
        }
      } else {
        console.error(chalk.red("Error: ssh-keygen not found!"))
        console.log(chalk.yellow("Please install OpenSSH:"))
        if (platform() === "darwin") {
          console.log(chalk.white("Run: brew install openssh"))
        } else {
          console.log(chalk.white("Run: sudo apt-get install openssh-client"))
        }
        process.exit(1)
      }
    }

    await ensureSSHDirectory()
    await generateKey()

    // Try to upload to GitHub if CLI is available
    const hasGitHubCli = await isGitHubCliAvailable()
    if (hasGitHubCli) {
      const username = await getGitHubUsername()
      const accountInfo = username ? ` (@${username})` : ""

      const { upload } = await inquirer.prompt([
        {
          type: "confirm",
          name: "upload",
          message: `Would you like to automatically add this SSH key to your GitHub account${accountInfo}?`,
          default: true,
        },
      ])

      if (upload) {
        await uploadKeyToGitHub(pubKeyPath)
      }
    }

    showNextSteps()

    // Add repository URL conversion
    if (await isGitRepo()) {
      const currentUrl = await getCurrentRemoteUrl()
      if (currentUrl && !currentUrl.startsWith("git@")) {
        const sshUrl = convertToSshUrl(currentUrl)
        if (sshUrl) {
          const { convert } = await inquirer.prompt([
            {
              type: "confirm",
              name: "convert",
              message: "Convert current repository's remote URL to SSH?",
              default: true,
            },
          ])

          if (convert) {
            await execPromise(`git remote set-url origin ${sshUrl}`)
            console.log(
              chalk.green(
                "\nRepository remote URL converted to SSH successfully!"
              )
            )
            console.log(chalk.white(`New URL: ${sshUrl}`))
          }
        } else {
          console.log(
            chalk.yellow(
              "\nNote: Current remote URL is not a GitHub/Bitbucket HTTPS URL. Skipping conversion."
            )
          )
        }
      } else {
        console.log(
          chalk.green(
            "\nNote: Current remote URL is already an SSH URL. Skipping conversion."
          )
        )
      }
    } else {
      console.log(
        chalk.yellow(
          "\nTip: To convert a repository's URL to SSH, run this command inside a Git repository"
        )
      )
    }
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message)
    process.exit(1)
  }
}

main()
