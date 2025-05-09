 #!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_message $GREEN "Memulai setup development environment di Ubuntu WSL..."

# Update package list
print_message $YELLOW "Mengupdate package list..."
sudo apt update && sudo apt upgrade -y

# Install build-essential dan dependency lainnya
print_message $YELLOW "Menginstal build-essential dan dependency..."
sudo apt install -y build-essential curl file git

# Install Zsh
print_message $YELLOW "Menginstal Zsh..."
sudo apt install -y zsh

# Install Oh My Zsh
print_message $YELLOW "Menginstal Oh My Zsh..."
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Install plugins Oh My Zsh
print_message $YELLOW "Menginstal plugins Oh My Zsh..."
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

# Backup .zshrc yang ada
if [ -f "$HOME/.zshrc" ]; then
    cp "$HOME/.zshrc" "$HOME/.zshrc.backup"
fi

# Update .zshrc configuration
sed -i 's/plugins=(git)/plugins=(git node npm golang docker zsh-autosuggestions zsh-syntax-highlighting)/' "$HOME/.zshrc"

# Set Zsh sebagai default shell
print_message $YELLOW "Mengatur Zsh sebagai default shell..."
chsh -s $(which zsh)

print_message $GREEN "Setup Ubuntu WSL selesai!"
print_message $YELLOW "Langkah selanjutnya:"
print_message $NC "1. Keluar dari terminal dan buka kembali"
print_message $NC "2. Zsh akan menjadi shell default Anda"
print_message $NC "3. Verifikasi instalasi dengan menjalankan:"
print_message $NC "   git --version"
print_message $NC "   node --version"
print_message $NC "   npm --version"
print_message $NC "   go version"
print_message $NC ""
print_message $NC "4. Konfigurasi Git:"
print_message $NC "   git config --global user.name \"Nama Anda\""
print_message $NC "   git config --global user.email \"email@anda.com\""