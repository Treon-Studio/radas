# Radas CLI

Radas CLI is a developer toolset for various development teams, providing tools for Frontend, Backend, DevOps, and Design teams, plus Firebase integration.

## Self-Update Mechanism

Radas CLI includes a self-update feature that allows users to easily update to the latest version. The CLI will automatically check for updates when run and notify users when a new version is available.

### Update Commands

To check for and apply updates:

```bash
# Check for updates and apply if available
radas update

# Only check if updates are available without installing
radas update --check

# Force update to latest version even if already up-to-date
radas update --force
```

## For Maintainers: How to Release New Versions

## Installation

You can install the radas CLI with a single command. The installer script will automatically detect your OS and architecture, download the correct `.tar.gz` release asset from GitHub, extract the binary, and place it in your `/usr/local/bin`.

**Install with curl:**
```sh
curl -fsSL https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash
```

**Or with wget:**
```sh
wget -qO- https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash
```

> The release assets are now distributed as `.tar.gz` archives. The install script will extract and install the correct binary for your platform automatically.

---

To create a new release that will be automatically detected by the self-update mechanism:

1. Update the version constant in `constants/version.go`
2. Build the binaries for all supported platforms:

```bash
# Example build script for multiple platforms
PLATFORMS="darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64"
VERSION=$(grep "Version =" constants/version.go | cut -d '"' -f 2)

for PLATFORM in $PLATFORMS; do
  GOOS=${PLATFORM%/*}
  GOARCH=${PLATFORM#*/}
  OUTPUT="bin/radas_${GOOS}_${GOARCH}"
  
  if [ "$GOOS" = "windows" ]; then
    OUTPUT="${OUTPUT}.exe"
  fi

  echo "Building for $GOOS/$GOARCH..."
  GOOS=$GOOS GOARCH=$GOARCH go build -o $OUTPUT .
done
```

3. Create a new GitHub release:
   - Tag the release with version format `v0.1.0` (prefixed with 'v')
   - Upload the built binaries as release assets
   - Include detailed release notes
   - Make sure binaries follow the naming pattern recognized by the updater: `radas_darwin_arm64`, `radas_linux_amd64`, etc.

---

## CLI Commands by Team

### Frontend (FE)

| Command                   | Description                                 | Example                   |
|--------------------------|---------------------------------------------|---------------------------|
| `radas fe init`          | Initialize frontend project structure        | `radas fe init`           |
| `radas fe build`         | Build frontend application                  | `radas fe build`          |
| `radas fe test`          | Run frontend tests                          | `radas fe test`           |
| `radas fe lint`          | Lint frontend codebase                      | `radas fe lint`           |

### Backend (BE)

| Command                   | Description                                 | Example                   |
|--------------------------|---------------------------------------------|---------------------------|
| `radas be init`          | Initialize backend service                  | `radas be init`           |
| `radas be migrate`       | Run database migrations                     | `radas be migrate`        |
| `radas be test`          | Run backend tests                           | `radas be test`           |
| `radas be lint`          | Lint backend codebase                       | `radas be lint`           |

### DevOps

| Command                   | Description                                 | Example                   |
|--------------------------|---------------------------------------------|---------------------------|
| `radas devops deploy`    | Deploy application to environment           | `radas devops deploy`     |
| `radas devops status`    | Check deployment status                     | `radas devops status`     |
| `radas devops logs`      | View deployment logs                        | `radas devops logs`       |

### Design

| Command                   | Description                                 | Example                   |
|--------------------------|---------------------------------------------|---------------------------|
| `radas design export`    | Export design assets                        | `radas design export`     |
| `radas design sync`      | Sync design system                          | `radas design sync`       |

## Self-Update Feature

Radas CLI supports **auto-update** directly from GitHub Releases.

### How to Update Automatically

```sh
radas update
```
- Checks for the latest version on GitHub Releases `raizora/radas`.
- If a new version is available, the CLI will automatically download and replace the current binary.
- If you are already using the latest version, it will display "Current version is the latest."

### How to Prepare a Release for Auto-Update
1. Build all binaries using the naming pattern: `radas_<os>_<arch>`
   - Example: `radas_darwin_amd64`, `radas_linux_amd64`, `radas_windows_amd64.exe`
2. Create a **new GitHub Release**:
   - Tag must use the format `vX.Y.Z` (e.g., `v0.2.0`)
   - Upload all built binaries as release assets
   - Add release notes describing the changes
3. After publishing the release, users can update their CLI using `radas update` without manual download.

### Example Build Script (multi-arch)
```sh
PLATFORMS="darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64"
for PLATFORM in $PLATFORMS; do
  GOOS=${PLATFORM%/*}
  GOARCH=${PLATFORM#*/}
  OUTPUT="bin/radas_${GOOS}_${GOARCH}"
  if [ "$GOOS" = "windows" ]; then
    OUTPUT="${OUTPUT}.exe"
  fi
  echo "Building for $GOOS/$GOARCH..."
  GOOS=$GOOS GOARCH=$GOARCH go build -o $OUTPUT .
done
```

---

## FAQ

- **What if the update fails due to permission issues?**
  Run with sudo if installed in `/usr/local/bin`:
  ```sh
  sudo radas update
  ```
- **How do I make sure the update feature works?**
  Ensure your GitHub release includes binaries with the correct naming pattern and uses the tag format `vX.Y.Z`.

The self-update mechanism uses GitHub's API to check for new releases and will download the appropriate binary for the user's platform. 