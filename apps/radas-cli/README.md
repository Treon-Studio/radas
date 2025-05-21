<div align="center">

<a href="https://radas.treonstudio.com" target="_blank" title="Go to the Radas CLI website"><img width="196px" alt="Radas logo" src="https://raw.githubusercontent.com/Radas/.github/main/images/Radas-logo.svg"></a>

<a name="readme-top"></a>

# The Radas CLI

Radas CLI is a powerful, all-in-one developer toolset revolutionizing workflows for Frontend, Backend, DevOps, and Design teams. Build production-ready applications in minutes, not hours.

[![Go version][go_version_img]][go_dev_url]
[![Go report][go_report_img]][go_report_url]
[![License][repo_license_img]][repo_license_url]

**&searr;&nbsp;&nbsp;The official Radas CLI documentation&nbsp;&nbsp;&swarr;**

[English][docs_url] · [Русский][docs_ru_url] · [简体中文][docs_zh_hk_url] · [Español][docs_es_url]

**&searr;&nbsp;&nbsp;Share the project's link to your friends&nbsp;&nbsp;&swarr;**

[![Share on X][x_share_img]][x_share_url]
[![Share on Telegram][telegram_share_img]][telegram_share_url]
[![Share on WhatsApp][whatsapp_share_img]][whatsapp_share_url]
[![Share on Reddit][reddit_share_img]][reddit_share_url]

<a href="https://radas.treonstudio.com" target="_blank" title="Go to the Radas CLI website"><img width="99%" alt="Radas create command" src="https://raw.githubusercontent.com/Radas/.github/main/images/Radas_create.gif"></a>

</div>

## 🎯 Motivation

At the heart of Radas CLI is a fundamental belief: **exceptional Developer Experience (DX) leads to exceptional products**. We've designed every aspect of this tool with your workflow in mind.

How many hours have you lost to boilerplate code, configuration files, and wrestling with build systems? 🤔 These tedious tasks not only waste valuable development time but actively diminish creativity and innovation.

For modern development teams, maintaining velocity is crucial. Yet developers frequently find themselves bogged down in repetitive setup tasks instead of focusing on what truly matters - creating value through code.

The **Radas** CLI reimagines this experience from the ground up. By automating the mundane aspects of project setup and configuration, we free you to focus on the creative and challenging parts of software development. Our mission is to provide a frictionless experience where:

- **Projects start in seconds**, not hours or days
- **Configuration is automated**, not manual and error-prone
- **Best practices are baked in**, not afterthoughts
- **Technology choices are flexible**, not restrictive
- **Learning curves are gentle**, not steep

That's why the **Radas** CLI was born. It allows you to start a new project faster with **Go**, **htmx**, **hyperscript** or **Alpine.js**, **Templ** and the most popular **CSS** frameworks - eliminating hours of configuration and boilerplate code.

We are here to transform your development workflow! ✨

## ✨ Features

Radas CLI offers an integrated suite of specialized development tools, meticulously crafted to enhance workflow across the entire development lifecycle. Our command-line interface puts powerful functionality at your fingertips, organized by team roles to streamline your development process:

### 🌐 General Commands

Foundational tools that power your daily development workflow. These commands help you manage projects, environments, and system health across any tech stack:

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `version` | Display detailed version information | `radas version` |
| `clone` | Clone repositories efficiently | `radas clone [repository]` |
| `goto` | Navigate to project directories | `radas goto [project]` |
| `doctor` | Check system health and requirements | `radas doctor` |
| `install` | Install dependencies and tools | `radas install` |
| `config` | Manage radas configuration | `radas config [get/set]` |
| `sync-repo` | Sync repository with remote | `radas sync-repo` |
| `env` | Manage environment variables | `radas env [get/set]` |
| `update` | Update radas CLI to latest version | `radas update` |
| `rebuild` | Rebuild your project | `radas rebuild` |
| `pull` | Pull latest changes from remote | `radas pull` |

### 🖥️ Frontend Commands

Purpose-built tools for modern UI development. These commands help frontend developers build, test, and optimize web interfaces with minimal friction:

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `fe doctor` | Check frontend environment | `radas fe doctor` |
| `fe install` | Install frontend dependencies | `radas fe install` |
| `fe clean` | Clean frontend build artifacts | `radas fe clean` |
| `fe dev` | Start development server | `radas fe dev` |
| `fe fresh` | Reinstall dependencies and start dev | `radas fe fresh` |
| `fe init` | Initialize new frontend project | `radas fe init [template]` |
| `fe build` | Build frontend for production | `radas fe build` |
| `fe blackhole` | Fix node_modules issues | `radas fe blackhole` |

### 🔧 Backend Commands

Streamlined tools for server-side development. These commands help backend engineers build robust APIs and services with built-in best practices:

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `be doctor` | Check backend environment | `radas be doctor` |
| `be init` | Initialize new backend project | `radas be init [template]` |
| `be install` | Install backend dependencies | `radas be install` |
| `be clean` | Clean backend build artifacts | `radas be clean` |
| `be fresh` | Reinstall dependencies and restart | `radas be fresh` |

### 🛠️ DevOps Commands

Infrastructure and deployment automation tools. These commands help DevOps teams maintain consistent environments and deployment pipelines:

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `devops doctor` | Check DevOps tools and configs | `radas devops doctor` |
| `devops deploy` | Deploy applications | `radas devops deploy` |
| `devops container` | Manage containers | `radas devops container [command]` |

### 🎨 Design Commands

Tools that bridge the gap between design and development. These commands help design teams integrate with the development workflow:

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `design doctor` | Check design tools | `radas design doctor` |
| `design export` | Export design assets | `radas design export` |


## 📍 Installation

> [!NOTE]
> Looking for other versions of the **Radas** CLI? They're located in these branches: [v1][repo_branch_v1_url], [v2][repo_branch_v2_url].

### 🔥 Quickest way to install

**Using curl:**

```console
curl -fsSL https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash
```

**Using wget:**

```console
wget -qO- https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash
```

### 🚀 Using Go

First, [download][go_download_url] and install **Go**. Version `1.24.0` (or higher) is required.

Now, you can use the **Radas** CLI without installation. Just run it with [`go run`][go_run_url] to create a new project:

```console
go run github.com/Radas/Radas/v3@latest create
```

That's it! 🔥 A wonderful web application has been created in the current folder in seconds.

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

### 🍺 Homebrew-way to quick start

GNU/Linux and Apple macOS users can install **Radas** CLI via [Homebrew][brew_url] for a seamless experience.

Tap a new formula:

```console
brew tap Radas/tap
```

Install:

```console
brew install Radas/tap/Radas
```

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

### 📦 Other ways to quick start

Download ready-made `exe` files for Windows, `deb` (for Debian, Ubuntu), `rpm` (for CentOS, Fedora), `apk` (for Alpine), or Arch Linux packages from the [Releases][repo_releases_url] page. Platform-specific packages ensure optimal performance on your system.

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

## 📖 Complete Dev guide

We always treasure your time and want you to start building really great web products on this awesome technology stack as soon as possible! Therefore, to get a complete guide to use and understand the basic principles of the **Radas** CLI, we have prepared a comprehensive explanation of the project in this 📖 [**Complete Dev guide**][docs_url].

<a href="https://radas.treonstudio.com" target="_blank" title="Go to the Radas's Complete user guide"><img width="480px" alt="Radas docs banner" src="https://raw.githubusercontent.com/Radas/.github/main/images/Radas-docs-banner.svg"></a>

I have taken care to make it **as comfortable as possible** for you to learn this wonderful tool, so each CLI command has a sufficient textual description, as well as a visual diagram of how it works.

> [!IMPORTANT]
> Don't forget to switch the documentation to your language to make it even more comfortable to learn new knowledge! Supported languages: [English][docs_url], [Русский][docs_ru_url], [简体中文][docs_zh_hk_url], [Español][docs_es_url].

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

### 🧠 The learning path

It's highly recommended to start exploring with short articles "[**What is Radas CLI?**](https://radas.treonstudio.com/getting-started)" and "[**How does it work?**](https://radas.treonstudio.com/getting-started/how-does-it-work)" to understand the basic principle and the main components built into the **Radas** CLI.

Next steps are:

1. [Install the CLI to your system](https://radas.treonstudio.com/complete-user-guide/installation)
2. [Start creating a new project](https://radas.treonstudio.com/complete-user-guide/create-new-project)
3. [Running your project locally](https://radas.treonstudio.com/complete-user-guide/run-your-project)

Hope you find answers to all of your questions! 😉

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

## 🏆 A win-win cooperation

If you liked the **Radas** CLI and found it useful for your tasks, please click a 👁️ **Watch** button to avoid missing notifications about new versions, and give it a 🌟 **GitHub Star**!

It really **motivates** us to make this product **even** better and helps other developers discover this productivity-enhancing tool.

<img width="100%" alt="Radas star and watch" src="https://github.com/Radas/Radas/assets/11155743/6f92ec26-1fe3-44c6-9a13-3abd3ffa58eb">

And now, we invite you to participate in this project! Let's work **together** to create and popularize the **most useful** tool for developers on the web today.

- [Issues][repo_issues_url]: report bugs and submit your feature requests - help shape the future of Radas.
- [Pull requests][repo_pull_request_url]: send your improvements to the current codebase - be part of the innovation.
- [Discussions][repo_discussions_url]: ask questions, discuss and share your ideas - join our thriving community.
- Share the project's link to your friends on [X (Twitter)][x_share_url], [Telegram][telegram_share_url], [WhatsApp][whatsapp_share_url], [Reddit][reddit_share_url] - spread the productivity.
- Say a few words about the project on your social networks and blogs ([Dev.to][dev_to_url], [Medium][medium_url], [Хабр][habr_url], and so on) - inspire others.
- Send your review about project to the [ProductHunt][producthunt_url] page - help more developers discover Radas.

Your PRs, issues & any words are welcome! Thank you 😘

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

### 👩‍💻👨‍💻 Contribute to the project

If you want to contribute to the project, please read the [contributing guide](https://github.com/Radas/Radas/blob/main/CONTRIBUTING.md) first. Your expertise can help thousands of developers build better applications faster.

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

### 🌟 Stargazers

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Radas/Radas&type=Date&theme=dark"/>
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Radas/Radas&type=Date"/>
  <img width="100%" alt="The Radas CLI star history chart" src="https://api.star-history.com/svg?repos=Radas/Radas&type=Date"/>
</picture>

<div align="right">

[&nwarr; Back to top](#readme-top)

</div>

## ⚠️ License

[`The Radas CLI`][repo_url] is free and open-source software licensed under the [Apache 2.0 License][repo_license_url], created and supported by [TreonStudio][author_url] with 🩵 for people and robots. Use it confidently in both personal and commercial projects. Official logo distributed under the [Creative Commons License][repo_cc_license_url] (CC BY-SA 4.0 International).

<!-- Go links -->

[author_url]: https://treonstudio.com
[go_url]: https://go.dev
[go_download_url]: https://golang.org/dl/
[go_run_url]: https://pkg.go.dev/cmd/go#hdr-Compile_and_run_Go_program
[go_install_url]: https://golang.org/cmd/go/#hdr-Compile_and_install_packages_and_dependencies
[go_report_url]: https://goreportcard.com/report/github.com/Radas/Radas/v3
[go_report_img]: https://img.shields.io/badge/Go_report-A+-success?style=for-the-badge&logo=none
[go_dev_url]: https://pkg.go.dev/github.com/Radas/Radas/v3
[go_version_img]: https://img.shields.io/badge/Go-1.24+-00ADD8?style=for-the-badge&logo=go

<!-- Repository links -->

[repo_url]: https://github.com/Radas/Radas
[repo_branch_v1_url]: https://github.com/Radas/Radas/tree/v1
[repo_branch_v2_url]: https://github.com/Radas/Radas/tree/v2
[repo_issues_url]: https://github.com/Radas/Radas/issues
[repo_pull_request_url]: https://github.com/Radas/Radas/pulls
[repo_discussions_url]: https://github.com/Radas/Radas/discussions
[repo_releases_url]: https://github.com/Radas/Radas/releases
[repo_license_url]: https://github.com/Radas/Radas/blob/main/LICENSE
[repo_license_img]: https://img.shields.io/badge/license-Apache_2.0-red?style=for-the-badge&logo=none
[repo_cc_license_url]: https://creativecommons.org/licenses/by-sa/4.0/
