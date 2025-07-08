<div align="center"><a name="readme-top"></a>

<a href="https://github.com/Treon-Studio/radas">
  <img src="https://github.com/user-attachments/assets/27070ab9-be52-4e0b-b1d6-3149e9826a70" width="120" alt="Radas Banner">
</a>

# Radas

A powerful, all-in-one developer toolset revolutionizing workflows for Frontend, Backend, DevOps, and Design teams.<br/>
Build production-ready applications in minutes, not hours with automated configuration and best practices.<br/>
Generate modern API clients with React Query, Axios, and Zod for type-safe, efficient applications.

[简体中文](./README.zh-CN.md) · [Official Site][official-site] · [Changelog][changelog] · [Documents][docs] · [Blog][blog] · [Feedback][github-issues-link]

[![][share-x-shield]][share-x-link]
[![][share-telegram-shield]][share-telegram-link]
[![][share-whatsapp-shield]][share-whatsapp-link]
[![][share-reddit-shield]][share-reddit-link]
[![][share-linkedin-shield]][share-linkedin-link]

![][image-overview]

</div>

<details>
<summary><kbd>Table of contents</kbd></summary>

#### TOC

- [👋🏻 Getting Started](#-getting-started)
- [✨ Features](#-features)
  - [`1` Modern API Client Generation](#1-modern-api-client-generation)
  - [`2` React Query Integration](#2-react-query-integration)
  - [`3` Type-Safe Validation with Zod](#3-type-safe-validation-with-zod)
  - [`4` Zustand Store Generation](#4-zustand-store-generation)
  - [`5` OpenAPI Specification Support](#5-openapi-specification-support)
  - [`6` Project Scaffolding](#6-project-scaffolding)
  - [`7` Efficient Error Handling](#7-efficient-error-handling)
  - [`8` Optimistic Updates](#8-optimistic-updates)
- [⌨️ Local Development](#️-local-development)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

####

<br/>

</details>

## 👋🏻 Getting Started

Radas CLI is a powerful developer tool that automates API client generation and improves your development workflow. Get started with these simple steps:

```bash
# Install Radas CLI
$ go install github.com/Treon-Studio/radas/apps/radas-cli@latest

# Generate API client from OpenAPI spec
$ radas-cli generate --input your-openapi-spec.yaml --output ./src/api
```

This will generate a complete API client with React Query hooks, Zod validation, and TypeScript types based on your OpenAPI specification.

### Example Usage

After generating your API client, you can use it in your React application like this:

```typescript
// Using the generated React Query hooks
import { useGetUsers, useCreateUser } from './api/hooks';

function UserList() {
  // Fetch users with automatic caching and refetching
  const { data: users, isLoading } = useGetUsers();
  
  // Mutation with optimistic updates
  const { mutate: createUser } = useCreateUser();
  
  // Type-safe data handling with Zod validation
  return (
    <div>
      {isLoading ? 'Loading...' : users.map(user => <UserItem key={user.id} user={user} />)}
      <button onClick={() => createUser({ name: 'New User' })}>Add User</button>
    </div>
  );
}

## ✨ Features

### `1` Modern API Client Generation

Radas CLI generates modern, type-safe API clients from your OpenAPI specifications, eliminating hours of manual coding and configuration. The generated clients feature:

- **Axios Integration**: Reliable HTTP request handling with proper error management
- **Zod Validation**: Runtime type checking and validation for API responses
- **TypeScript Support**: Full type safety throughout your API client
- **Clean Architecture**: Well-organized code structure following best practices
- **Consistent Naming**: Preserves exact operation ID casing from your OpenAPI specification

[![][back-to-top]](#readme-top)

### `2` React Query Integration

Radas CLI seamlessly integrates with React Query to provide a powerful data-fetching experience:

- **Optimized Hooks**: Auto-generated custom hooks for each API endpoint
- **Automatic Caching**: Smart data caching to reduce unnecessary network requests
- **Query Invalidation**: Proper cache invalidation patterns for data consistency
- **No Duplicates**: Intelligent tracking of operations to prevent duplicate function generation
- **Modern Patterns**: Uses React Query v4+ patterns for optimal performance

[![][back-to-top]](#readme-top)

### `3` Type-Safe Validation with Zod

Radas CLI leverages Zod for robust runtime validation and type safety:

- **Schema Validation**: Automatically generated Zod schemas from OpenAPI specifications
- **Runtime Type Checking**: Ensures data integrity between client and server
- **Custom ValidationError Class**: Improved error handling with detailed validation feedback
- **Type Inference**: TypeScript types derived directly from Zod schemas
- **Consistent DTO Types**: Ensures correct data transfer object types throughout the codebase

[![][back-to-top]](#readme-top)

### `4` Zustand Store Generation

Radas CLI automatically generates Zustand stores for efficient state management:

- **Case Preservation**: Maintains exact casing of API function names from the OpenAPI spec
- **Naming Conventions**: Follows consistent patterns like prefixing GET methods with "fetch"
- **Optimized Structure**: Generates compact, efficient store code without unnecessary newlines
- **Parameter Handling**: Properly quotes parameter names with special characters like hyphens
- **API Integration**: Seamlessly connects generated stores with the API client

[![][back-to-top]](#readme-top)

### `5` OpenAPI Specification Support

Radas CLI works seamlessly with OpenAPI specifications to generate client code:

- **AI-Friendly Format**: Works with OpenAPI specs optimized for code generation
- **Schema Parsing**: Accurately parses and interprets complex OpenAPI schemas
- **Version Support**: Compatible with OpenAPI 3.0+ specifications
- **Custom Extensions**: Supports OpenAPI extensions for enhanced functionality
- **Automatic Type Mapping**: Converts OpenAPI types to appropriate TypeScript types

<div align="right">

[![][back-to-top]](#readme-top)

</div>

### `6` Project Scaffolding

Radas CLI helps you quickly bootstrap new projects with best practices built in:

- **Template Selection**: Choose from various project templates for different use cases
- **Configuration Automation**: Auto-generates configuration files for your tech stack
- **Dependency Management**: Sets up proper package dependencies with appropriate versions
- **File Structure**: Creates an organized project structure following best practices
- **Ready to Run**: Generated projects work out of the box with minimal setup

### `7` Efficient Error Handling

Radas CLI implements robust error handling throughout the generated code:

- **Custom ValidationError Class**: Provides detailed validation feedback for API responses
- **Type-Safe Error Handling**: Strong typing for error objects and responses
- **Contextual Error Messages**: Clear error messages that indicate the source of the problem
- **Graceful Degradation**: Proper fallback mechanisms when API calls fail
- **Debugging Support**: Helpful error information for debugging API integration issues

<div align="right">

[![][back-to-top]](#readme-top)

</div>

### `8` Optimistic Updates

Radas CLI generates code with optimistic update patterns for a responsive user experience:

- **Immediate UI Updates**: Interface updates instantly before server confirmation
- **Context Typing**: Proper TypeScript typing for optimistic update contexts
- **Rollback Handling**: Automatic rollback mechanisms if server requests fail
- **Cache Management**: Smart cache updates that maintain consistency
- **Query Invalidation**: Proper invalidation of related queries after mutations
<div align="right">

[![][back-to-top]](#readme-top)

</div>

## ⌨️ Local Development

You can clone the repository for local development:

```bash
$ git clone https://github.com/Treon-Studio/radas.git
$ cd radas
$ cd apps/radas-cli
$ go build
```

## 🤝 Contributing

Contributions to the Radas CLI tool are welcome! Whether it's bug reports, feature requests, or code contributions, your help is appreciated.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For more details, please refer to the [CONTRIBUTING.md](./CONTRIBUTING.md) file.

## 📄 License

The Radas CLI tool is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for more details.

---

<div align="center">

Made with ❤️ by [Treon Studio](https://github.com/Treon-Studio)

</div>



<!-- Reference Links -->
<!-- Badges -->
[back-to-top]: https://img.shields.io/badge/-Back%20to%20top-grey?style=flat-square

<!-- Links -->
[official-site]: https://treon-studio.github.io/radas
[changelog]: https://github.com/Treon-Studio/radas/blob/main/CHANGELOG.md
[docs]: https://treon-studio.github.io/radas/docs
[blog]: https://treon-studio.github.io/radas/blog
[github-issues-link]: https://github.com/Treon-Studio/radas/issues
























---

## 📚 Documentation

For more detailed documentation on how to use the Radas CLI, please visit our [documentation site][docs].

## 🧩 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the Apache License 2.0. See `LICENSE` for more information.

---

<div align="center">

Made with ❤️ by [Treon Studio](https://github.com/Treon-Studio)



</div>

<!-- Reference Links -->
<!-- Badges -->
[back-to-top]: https://img.shields.io/badge/-Back%20to%20top-grey?style=flat-square

<!-- Links -->
[official-site]: https://treon-studio.github.io/radas
[changelog]: https://github.com/Treon-Studio/radas/blob/main/CHANGELOG.md
[docs]: https://treon-studio.github.io/radas/docs
[blog]: https://treon-studio.github.io/radas/blog
[github-issues-link]: https://github.com/Treon-Studio/radas/issues





## 🤝 Contributing

Contributions of all types are more than welcome; if you are interested in contributing code, feel free to check out our GitRadasHub [Issues][github-issues-link] and [Projects][github-project-link] to get stuck in to show us what you're made of.

## 📄 License
> \[!TIP]
>
> We are creating a technology-driven forum, fostering knowledge interaction and the exchange of ideas that may culminate in mutual inspiration and collaborative innovation.
>
> Help us make RadasChat better. Welcome to provide product design feedback, user experience discussions directly to us.
>
> **Principal Maintainers:** [@arvinxx](https://github.com/arvinxx) [@canisminor1990](https://github.com/canisminor1990)

[![][pr-welcome-shield]][pr-welcome-link]
[![][submit-agents-shield]][submit-agents-link]
[![][submit-plugin-shield]][submit-plugin-link]

<a href="https://github.com/radashub/radas-chat/graphs/contributors" target="_blank">
  <table>
    <tr>
      <th colspan="2">
        <br><img src="https://contrib.rocks/image?repo=radashub/radas-chat"><br><br>
      </th>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=2x3&color_scheme=dark">
          <img src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=2x3&color_scheme=light">
        </picture>
      </td>
      <td rowspan="2">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=active&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=4x7&color_scheme=dark">
          <img src="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=active&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=4x7&color_scheme=light">
        </picture>
      </td>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=2x3&color_scheme=dark">
          <img src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=131470832&repo_ids=643445235&image_size=2x3&color_scheme=light">
        </picture>
      </td>
    </tr>
  </table>
</a>

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 🔗 More Products

- **[🅰️ Munaqadh][radas-theme]:** Modern theme for Stable Diffusion WebUI, exquisite interface design, highly customizable UI, and efficiency-boosting features.
- **[⛵️ Klola][radas-midjourney-webui]:** WebUI for Midjourney, leverages AI to quickly generate a wide array of rich and diverse images from text prompts, sparking creativity and enhancing conversations.
- **[🌏 Dokukita][radas-i18n] :** Radas i18n is an automation tool for the i18n (internationalization) translation process, powered by ChatGPT. It supports features such as automatic splitting of large files, incremental updates, and customization options for the OpenAI model, API proxy, and temperature.
- **[💌 Palsu][radas-commit]:** Radas Commit is a CLI tool that leverages Langchain/ChatGPT to generate Gitmoji-based commit messages.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

---

<details><summary><h4>📝 License</h4></summary>

[![][fossa-license-shield]][fossa-license-link]

</details>

Copyright © 2025 [RadasRadasHub][profile-link]. <br />
This project is [Apache 2.0](./LICENSE) licensed.

<!-- LINK GROUP -->

[back-to-top]: https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square
[blog]: https://radas.raizora.com/blog
[changelog]: https://radas.raizora.com/changelog
[chat-desktop]: https://raw.githubusercontent.com/radashub/radas-chat/lighthouse/lighthouse/chat/desktop/pagespeed.svg
[chat-desktop-report]: https://radashub.github.io/radas-chat/lighthouse/chat/desktop/chat_preview_radashub_com_chat.html
[chat-mobile]: https://raw.githubusercontent.com/radashub/radas-chat/lighthouse/lighthouse/chat/mobile/pagespeed.svg
[chat-mobile-report]: https://radashub.github.io/radas-chat/lighthouse/chat/mobile/chat_preview_radashub_com_chat.html
[chat-plugin-sdk]: https://github.com/radashub/chat-plugin-sdk
[chat-plugin-template]: https://github.com/radashub/chat-plugin-template
[chat-plugins-gateway]: https://github.com/radashub/chat-plugins-gateway
[codecov-link]: https://codecov.io/gh/radashub/radas-chat
[codecov-shield]: https://img.shields.io/codecov/c/github/radashub/radas-chat?labelColor=black&style=flat-square&logo=codecov&logoColor=white
[codespaces-link]: https://codespaces.new/radashub/radas-chat
[codespaces-shield]: https://github.com/codespaces/badge.svg
[deploy-button-image]: https://vercel.com/button
[deploy-link]: https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat&env=OPENAI_API_KEY,ACCESS_CODE&envDescription=Find%20your%20OpenAI%20API%20Key%20by%20click%20the%20right%20Learn%20More%20button.%20%7C%20Access%20Code%20can%20protect%20your%20website&envLink=https%3A%2F%2Fplatform.openai.com%2Faccount%2Fapi-keys&project-name=radas-chat&repository-name=radas-chat
[deploy-on-alibaba-cloud-button-image]: https://service-info-public.oss-cn-hangzhou.aliyuncs.com/computenest-en.svg
[deploy-on-alibaba-cloud-link]: https://computenest.console.aliyun.com/service/instance/create/default?type=user&ServiceName=RadasChat%E7%A4%BE%E5%8C%BA%E7%89%88
[deploy-on-repocloud-button-image]: https://d16t0pc4846x52.cloudfront.net/deployradas.svg
[deploy-on-repocloud-link]: https://repocloud.io/details/?app_id=248
[deploy-on-sealos-button-image]: https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg
[deploy-on-sealos-link]: https://template.usw.sealos.io/deploy?templateName=radas-chat-db
[deploy-on-zeabur-button-image]: https://zeabur.com/button.svg
[deploy-on-zeabur-link]: https://zeabur.com/templates/VZGGTI
[discord-link]: https://discord.gg/AYFPHvv2jT
[discord-shield]: https://img.shields.io/discord/1127171173982154893?color=5865F2&label=discord&labelColor=black&logo=discord&logoColor=white&style=flat-square
[discord-shield-badge]: https://img.shields.io/discord/1127171173982154893?color=5865F2&label=discord&labelColor=black&logo=discord&logoColor=white&style=for-the-badge
[docker-pulls-link]: https://hub.docker.com/r/radashub/radas-chat-database
[docker-pulls-shield]: https://img.shields.io/docker/pulls/radashub/radas-chat?color=45cc11&labelColor=black&style=flat-square&sort=semver
[docker-release-link]: https://hub.docker.com/r/radashub/radas-chat-database
[docker-release-shield]: https://img.shields.io/docker/v/radashub/radas-chat-database?color=369eff&label=docker&labelColor=black&logo=docker&logoColor=white&style=flat-square&sort=semver
[docker-size-link]: https://hub.docker.com/r/radashub/radas-chat-database
[docker-size-shield]: https://img.shields.io/docker/image-size/radashub/radas-chat-database?color=369eff&labelColor=black&style=flat-square&sort=semver
[docs]: https://radas.raizora.com/docs/usage/start
[docs-dev-guide]: https://github.com/radashub/radas-chat/wiki/index
[docs-docker]: https://radas.raizora.com/docs/self-hosting/server-database/docker-compose
[docs-env-var]: https://radas.raizora.com/docs/self-hosting/environment-variables
[docs-feat-agent]: https://radas.raizora.com/docs/usage/features/agent-market
[docs-feat-artifacts]: https://radas.raizora.com/docs/usage/features/artifacts
[docs-feat-auth]: https://radas.raizora.com/docs/usage/features/auth
[docs-feat-branch]: https://radas.raizora.com/docs/usage/features/branching-conversations
[docs-feat-cot]: https://radas.raizora.com/docs/usage/features/cot
[docs-feat-database]: https://radas.raizora.com/docs/usage/features/database
[docs-feat-knowledgebase]: https://radas.raizora.com/blog/knowledge-base
[docs-feat-local]: https://radas.raizora.com/docs/usage/features/local-llm
[docs-feat-mobile]: https://radas.raizora.com/docs/usage/features/mobile
[docs-feat-plugin]: https://radas.raizora.com/docs/usage/features/plugin-system
[docs-feat-provider]: https://radas.raizora.com/docs/usage/features/multi-ai-providers
[docs-feat-pwa]: https://radas.raizora.com/docs/usage/features/pwa
[docs-feat-t2i]: https://radas.raizora.com/docs/usage/features/text-to-image
[docs-feat-theme]: https://radas.raizora.com/docs/usage/features/theme
[docs-feat-tts]: https://radas.raizora.com/docs/usage/features/tts
[docs-feat-vision]: https://radas.raizora.com/docs/usage/features/vision
[docs-functionc-call]: https://radas.raizora.com/blog/openai-function-call
[docs-lighthouse]: https://github.com/radashub/radas-chat/wiki/Lighthouse
[docs-plugin-dev]: https://radas.raizora.com/docs/usage/plugins/development
[docs-self-hosting]: https://radas.raizora.com/docs/self-hosting/start
[docs-upstream-sync]: https://radas.raizora.com/docs/self-hosting/advanced/upstream-sync
[docs-usage-ollama]: https://radas.raizora.com/docs/usage/providers/ollama
[docs-usage-plugin]: https://radas.raizora.com/docs/usage/plugins/basic
[fossa-license-link]: https://app.fossa.com/projects/git%2Bgithub.com%2Fradashub%2Fradas-chat
[fossa-license-shield]: https://app.fossa.com/api/projects/git%2Bgithub.com%2Fradashub%2Fradas-chat.svg?type=large
[github-action-release-link]: https://github.com/actions/workflows/radashub/radas-chat/release.yml
[github-action-release-shield]: https://img.shields.io/github/actions/workflow/status/radashub/radas-chat/release.yml?label=release&labelColor=black&logo=githubactions&logoColor=white&style=flat-square
[github-action-test-link]: https://github.com/actions/workflows/radashub/radas-chat/test.yml
[github-action-test-shield]: https://img.shields.io/github/actions/workflow/status/radashub/radas-chat/test.yml?label=test&labelColor=black&logo=githubactions&logoColor=white&style=flat-square
[github-contributors-link]: https://github.com/radashub/radas-chat/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/radashub/radas-chat?color=c4f042&labelColor=black&style=flat-square
[github-forks-link]: https://github.com/radashub/radas-chat/network/members
[github-forks-shield]: https://img.shields.io/github/forks/radashub/radas-chat?color=8ae8ff&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/radashub/radas-chat/issues
[github-issues-shield]: https://img.shields.io/github/issues/radashub/radas-chat?color=ff80eb&labelColor=black&style=flat-square
[github-license-link]: https://github.com/radashub/radas-chat/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/badge/license-apache%202.0-white?labelColor=black&style=flat-square
[github-project-link]: https://github.com/radashub/radas-chat/projects
[github-release-link]: https://github.com/radashub/radas-chat/releases
[github-release-shield]: https://img.shields.io/github/v/release/radashub/radas-chat?color=369eff&labelColor=black&logo=github&style=flat-square
[github-releasedate-link]: https://github.com/radashub/radas-chat/releases
[github-releasedate-shield]: https://img.shields.io/github/release-date/radashub/radas-chat?labelColor=black&style=flat-square
[github-stars-link]: https://github.com/radashub/radas-chat/network/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/radashub/radas-chat?color=ffcb47&labelColor=black&style=flat-square
[github-trending-shield]: https://trendshift.io/api/badge/repositories/2256
[github-trending-url]: https://trendshift.io/repositories/2256
[image-banner]: https://github.com/user-attachments/assets/27070ab9-be52-4e0b-b1d6-3149e9826a70

[image-feat-agent]: https://github.com/user-attachments/assets/b3ab6e35-4fbc-468d-af10-e3e0c687350f
[image-feat-artifacts]: https://github.com/user-attachments/assets/7f95fad6-b210-4e6e-84a0-7f39e96f3a00
[image-feat-auth]: https://github.com/user-attachments/assets/80bb232e-19d1-4f97-98d6-e291f3585e6d
[image-feat-branch]: https://github.com/user-attachments/assets/92f72082-02bd-4835-9c54-b089aad7fd41
[image-feat-cot]: https://github.com/user-attachments/assets/f74f1139-d115-4e9c-8c43-040a53797a5e
[image-feat-database]: https://github.com/user-attachments/assets/f1697c8b-d1fb-4dac-ba05-153c6295d91d
[image-feat-knowledgebase]: https://github.com/user-attachments/assets/7da7a3b2-92fd-4630-9f4e-8560c74955ae
[image-feat-local]: https://github.com/user-attachments/assets/1239da50-d832-4632-a7ef-bd754c0f3850
[image-feat-mobile]: https://github.com/user-attachments/assets/32cf43c4-96bd-4a4c-bfb6-59acde6fe380
[image-feat-plugin]: https://github.com/user-attachments/assets/66a891ac-01b6-4e3f-b978-2eb07b489b1b
[image-feat-privoder]: https://github.com/user-attachments/assets/e553e407-42de-4919-977d-7dbfcf44a821
[image-feat-pwa]: https://github.com/user-attachments/assets/9647f70f-b71b-43b6-9564-7cdd12d1c24d
[image-feat-t2i]: https://github.com/user-attachments/assets/708274a7-2458-494b-a6ec-b73dfa1fa7c2
[image-feat-theme]: https://github.com/user-attachments/assets/b47c39f1-806f-492b-8fcb-b0fa973937c1
[image-feat-tts]: https://github.com/user-attachments/assets/50189597-2cc3-4002-b4c8-756a52ad5c0a
[image-feat-vision]: https://github.com/user-attachments/assets/18574a1f-46c2-4cbc-af2c-35a86e128a07
[image-overview]: https://github.com/user-attachments/assets/dbfaa84a-2c82-4dd9-815c-5be616f264a4
[image-star]: https://github.com/user-attachments/assets/c3b482e7-cef5-4e94-bef9-226900ecfaab
[issues-link]: https://img.shields.io/github/issues/radashub/radas-chat.svg?style=flat
[radas-chat-plugins]: https://github.com/radashub/radas-chat-plugins
[radas-commit]: https://github.com/radashub/radas-commit/tree/master/packages/radas-commit
[radas-i18n]: https://github.com/radashub/radas-commit/tree/master/packages/radas-i18n
[radas-icons-github]: https://github.com/radashub/radas-icons
[radas-icons-link]: https://www.npmjs.com/package/@radashub/icons
[radas-icons-shield]: https://img.shields.io/npm/v/@radashub/icons?color=369eff&labelColor=black&logo=npm&logoColor=white&style=flat-square
[radas-lint-github]: https://github.com/radashub/radas-lint
[radas-lint-link]: https://www.npmjs.com/package/@radashub/lint
[radas-lint-shield]: https://img.shields.io/npm/v/@radashub/lint?color=369eff&labelColor=black&logo=npm&logoColor=white&style=flat-square
[radas-midjourney-webui]: https://github.com/radashub/radas-midjourney-webui
[radas-theme]: https://github.com/radashub/sd-webui-radas-theme
[radas-tts-github]: https://github.com/radashub/radas-tts
[radas-tts-link]: https://www.npmjs.com/package/@radashub/tts
[radas-tts-shield]: https://img.shields.io/npm/v/@radashub/tts?color=369eff&labelColor=black&logo=npm&logoColor=white&style=flat-square
[radas-ui-github]: https://github.com/radashub/radas-ui
[radas-ui-link]: https://www.npmjs.com/package/@radashub/ui
[radas-ui-shield]: https://img.shields.io/npm/v/@radashub/ui?color=369eff&labelColor=black&logo=npm&logoColor=white&style=flat-square
[official-site]: https://radas.raizora.com
[pr-welcome-link]: https://github.com/radashub/radas-chat/pulls
[pr-welcome-shield]: https://img.shields.io/badge/🤯_pr_welcome-%E2%86%92-ffcb47?labelColor=black&style=for-the-badge
[profile-link]: https://github.com/radashub
[share-linkedin-link]: https://linkedin.com/feed
[share-linkedin-shield]: https://img.shields.io/badge/-share%20on%20linkedin-black?labelColor=black&logo=linkedin&logoColor=white&style=flat-square
[share-mastodon-link]: https://mastodon.social/share?text=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source,%20extensible%20%28Function%20Calling%29,%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.%20https://github.com/radashub/radas-chat%20#chatbot%20#chatGPT%20#openAI
[share-mastodon-shield]: https://img.shields.io/badge/-share%20on%20mastodon-black?labelColor=black&logo=mastodon&logoColor=white&style=flat-square
[share-reddit-link]: https://www.reddit.com/submit?title=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source%2C%20extensible%20%28Function%20Calling%29%2C%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.%20%23chatbot%20%23chatGPT%20%23openAI&url=https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat
[share-reddit-shield]: https://img.shields.io/badge/-share%20on%20reddit-black?labelColor=black&logo=reddit&logoColor=white&style=flat-square
[share-telegram-link]: https://t.me/share/url"?text=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source%2C%20extensible%20%28Function%20Calling%29%2C%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.%20%23chatbot%20%23chatGPT%20%23openAI&url=https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat
[share-telegram-shield]: https://img.shields.io/badge/-share%20on%20telegram-black?labelColor=black&logo=telegram&logoColor=white&style=flat-square
[share-weibo-link]: http://service.weibo.com/share/share.php?sharesource=weibo&title=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source%2C%20extensible%20%28Function%20Calling%29%2C%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.%20%23chatbot%20%23chatGPT%20%23openAI&url=https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat
[share-weibo-shield]: https://img.shields.io/badge/-share%20on%20weibo-black?labelColor=black&logo=sinaweibo&logoColor=white&style=flat-square
[share-whatsapp-link]: https://api.whatsapp.com/send?text=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source%2C%20extensible%20%28Function%20Calling%29%2C%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.%20https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat%20%23chatbot%20%23chatGPT%20%23openAI
[share-whatsapp-shield]: https://img.shields.io/badge/-share%20on%20whatsapp-black?labelColor=black&logo=whatsapp&logoColor=white&style=flat-square
[share-x-link]: https://x.com/intent/tweet?hashtags=chatbot%2CchatGPT%2CopenAI&text=Check%20this%20GitRadasHub%20repository%20out%20%F0%9F%A4%AF%20RadasChat%20-%20An%20open-source%2C%20extensible%20%28Function%20Calling%29%2C%20high-performance%20chatbot%20framework.%20It%20supports%20one-click%20free%20deployment%20of%20your%20private%20ChatGPT%2FLLM%20web%20application.&url=https%3A%2F%2Fgithub.com%2Fradashub%2Fradas-chat
[share-x-shield]: https://img.shields.io/badge/-share%20on%20x-black?labelColor=black&logo=x&logoColor=white&style=flat-square
[sponsor-link]: https://opencollective.com/radashub 'Become ❤️ RadasRadasHub Sponsor'
[sponsor-shield]: https://img.shields.io/badge/-Sponsor%20RadasRadasHub-f04f88?logo=opencollective&logoColor=white&style=flat-square
[submit-agents-link]: https://github.com/radashub/radas-chat-agents
[submit-agents-shield]: https://img.shields.io/badge/🤖/🏪_submit_agent-%E2%86%92-c4f042?labelColor=black&style=for-the-badge
[submit-plugin-link]: https://github.com/radashub/radas-chat-plugins
[submit-plugin-shield]: https://img.shields.io/badge/🧩/🏪_submit_plugin-%E2%86%92-95f3d9?labelColor=black&style=for-the-badge
[vercel-link]: https://chat-preview.radas.raizora.com
[vercel-shield]: https://img.shields.io/badge/vercel-online-55b467?labelColor=black&logo=vercel&style=flat-square
[vercel-shield-badge]: https://img.shields.io/badge/TRY%20RADASCHAT-ONLINE-55b467?labelColor=black&logo=vercel&style=for-the-badge