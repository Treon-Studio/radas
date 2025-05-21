<div align="center"><a name="readme-top"></a>

[![][image-banner]][vercel-link]

# Radas

An open-source, modern-design ChatGPT/LLMs UI/Framework.<br/>
Supports speech-synthesis, multi-modal, and extensible ([function call][docs-functionc-call]) plugin system.<br/>
One-click **FREE** deployment of your private OpenAI ChatGPT/Claude/Gemini/Groq/Ollama chat application.

**English** · [简体中文](./README.zh-CN.md) · [Official Site][official-site] · [Changelog][changelog] · [Documents][docs] · [Blog][blog] · [Feedback][github-issues-link]

<!-- SHIELD GROUP -->

[![][github-release-shield]][github-release-link]
[![][docker-release-shield]][docker-release-link]
[![][vercel-shield]][vercel-link]
[![][discord-shield]][discord-link]<br/>
[![][codecov-shield]][codecov-link]
[![][github-action-test-shield]][github-action-test-link]
[![][github-action-release-shield]][github-action-release-link]
[![][github-releasedate-shield]][github-releasedate-link]<br/>
[![][github-contributors-shield]][github-contributors-link]
[![][github-forks-shield]][github-forks-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]
[![][github-license-shield]][github-license-link]<br>
[![][sponsor-shield]][sponsor-link]

**Share RadasChat Repository**

[![][share-x-shield]][share-x-link]
[![][share-telegram-shield]][share-telegram-link]
[![][share-whatsapp-shield]][share-whatsapp-link]
[![][share-reddit-shield]][share-reddit-link]
[![][share-weibo-shield]][share-weibo-link]
[![][share-mastodon-shield]][share-mastodon-link]
[![][share-linkedin-shield]][share-linkedin-link]

<sup>Pioneering the new age of thinking and creating. Built for you, the Super Individual.</sup>

[![][github-trending-shield]][github-trending-url]

![][image-overview]

</div>

<details>
<summary><kbd>Table of contents</kbd></summary>

#### TOC

- [👋🏻 Getting Started & Join Our Community](#-getting-started--join-our-community)
- [✨ Features](#-features)
  - [`1` Chain of Thought](#1-chain-of-thought)
  - [`2` Branching Conversations](#2-branching-conversations)
  - [`3` Artifacts Support](#3-artifacts-support)
  - [`4` File Upload /Knowledge Base](#4-file-upload-knowledge-base)
  - [`5` Multi-Model Service Provider Support](#5-multi-model-service-provider-support)
  - [`6` Local Large Language Model (LLM) Support](#6-local-large-language-model-llm-support)
  - [`7` Model Visual Recognition](#7-model-visual-recognition)
  - [`8` TTS & STT Voice Conversation](#8-tts--stt-voice-conversation)
  - [`9` Text to Image Generation](#9-text-to-image-generation)
  - [`10` Plugin System (Function Calling)](#10-plugin-system-function-calling)
  - [`11` Agent Market (GPTs)](#11-agent-market-gpts)
  - [`12` Support Local / Remote Database](#12-support-local--remote-database)
  - [`13` Support Multi-User Management](#13-support-multi-user-management)
  - [`14` Progressive Web App (PWA)](#14-progressive-web-app-pwa)
  - [`15` Mobile Device Adaptation](#15-mobile-device-adaptation)
  - [`16` Custom Themes](#16-custom-themes)
  - [`*` What's more](#-whats-more)
- [⚡️ Performance](#️-performance)
- [🛳 Self Hosting](#-self-hosting)
  - [`A` Deploying with Vercel, Zeabur , Sealos or Alibaba Cloud](#a-deploying-with-vercel-zeabur--sealos-or-alibaba-cloud)
  - [`B` Deploying with Docker](#b-deploying-with-docker)
  - [Environment Variable](#environment-variable)
- [📦 Ecosystem](#-ecosystem)
- [🧩 Plugins](#-plugins)
- [⌨️ Local Development](#️-local-development)
- [🤝 Contributing](#-contributing)
- [❤️ Sponsor](#️-sponsor)
- [🔗 More Products](#-more-products)

####

<br/>

</details>

## 👋🏻 Getting Started & Join Our Community

We are a group of e/acc design-engineers, hoping to provide modern design components and tools for AIGC.
By adopting the Bootstrapping approach, we aim to provide developers and users with a more open, transparent, and user-friendly product ecosystem.

Whether for users or professional developers, RadasRadasHub will be your AI Agent playground. Please be aware that RadasChat is currently under active development, and feedback is welcome for any [issues][issues-link] encountered.

| [![][vercel-shield-badge]][vercel-link]   | No installation or registration necessary! Visit our website to experience it firsthand.                           |
| :---------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| [![][discord-shield-badge]][discord-link] | Join our Discord community! This is where you can connect with developers and other enthusiastic users of RadasRadasHub. |

> \[!IMPORTANT]
>
> **Star Us**, You will receive all release notifications from GitRadasHub without any delay \~ ⭐️

[![][image-star]][github-stars-link]

<details>
  <summary><kbd>Star History</kbd></summary>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=radashub%2Fradas-chat&theme=dark&type=Date">
    <img width="100%" src="https://api.star-history.com/svg?repos=radashub%2Fradas-chat&type=Date">
  </picture>
</details>

## ✨ Features

[![][image-feat-cot]][docs-feat-cot]

### `1` [Chain of Thought][docs-feat-cot]

Experience AI reasoning like never before. Watch as complex problems unfold step by step through our innovative Chain of Thought (CoT) visualization. This breakthrough feature provides unprecedented transparency into AI's decision-making process, allowing you to observe how conclusions are reached in real-time.

By breaking down complex reasoning into clear, logical steps, you can better understand and validate the AI's problem-solving approach. Whether you're debugging, learning, or simply curious about AI reasoning, CoT visualization transforms abstract thinking into an engaging, interactive experience.

[![][back-to-top]](#readme-top)

[![][image-feat-branch]][docs-feat-branch]

### `2` [Branching Conversations][docs-feat-branch]

Introducing a more natural and flexible way to chat with AI. With Branch Conversations, your discussions can flow in multiple directions, just like human conversations do. Create new conversation branches from any message, giving you the freedom to explore different paths while preserving the original context.

Choose between two powerful modes:

- **Continuation Mode:** Seamlessly extend your current discussion while maintaining valuable context
- **Standalone Mode:** Start fresh with a new topic based on any previous message

This groundbreaking feature transforms linear conversations into dynamic, tree-like structures, enabling deeper exploration of ideas and more productive interactions.

[![][back-to-top]](#readme-top)

[![][image-feat-artifacts]][docs-feat-artifacts]

### `3` [Artifacts Support][docs-feat-artifacts]

Experience the power of Claude Artifacts, now integrated into RadasChat. This revolutionary feature expands the boundaries of AI-human interaction, enabling real-time creation and visualization of diverse content formats.

Create and visualize with unprecedented flexibility:

- Generate and display dynamic SVG graphics
- Build and render interactive HTML pages in real-time
- Produce professional documents in multiple formats

[![][back-to-top]](#readme-top)

[![][image-feat-knowledgebase]][docs-feat-knowledgebase]

### `4` [File Upload /Knowledge Base][docs-feat-knowledgebase]

RadasChat supports file upload and knowledge base functionality. You can upload various types of files including documents, images, audio, and video, as well as create knowledge bases, making it convenient for users to manage and search for files. Additionally, you can utilize files and knowledge base features during conversations, enabling a richer dialogue experience.

<https://github.com/user-attachments/assets/faa8cf67-e743-4590-8bf6-ebf6ccc34175>

> \[!TIP]
>
> Learn more on [📘 RadasChat Knowledge Base Launch — From Now On, Every Step Counts](https://radas.raizora.com/blog/knowledge-base)

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-privoder]][docs-feat-provider]

### `5` [Multi-Model Service Provider Support][docs-feat-provider]

In the continuous development of RadasChat, we deeply understand the importance of diversity in model service providers for meeting the needs of the community when providing AI conversation services. Therefore, we have expanded our support to multiple model service providers, rather than being limited to a single one, in order to offer users a more diverse and rich selection of conversations.

In this way, RadasChat can more flexibly adapt to the needs of different users, while also providing developers with a wider range of choices.

#### Supported Model Service Providers

We have implemented support for the following model service providers:

<!-- PROVIDER LIST -->

- **[OpenAI](https://radaschat.com/discover/provider/openai)**: OpenAI is a global leader in artificial intelligence research, with models like the GPT series pushing the frontiers of natural language processing. OpenAI is committed to transforming multiple industries through innovative and efficient AI solutions. Their products demonstrate significant performance and cost-effectiveness, widely used in research, business, and innovative applications.
- **[Ollama](https://radaschat.com/discover/provider/ollama)**: Ollama provides models that cover a wide range of fields, including code generation, mathematical operations, multilingual processing, and conversational interaction, catering to diverse enterprise-level and localized deployment needs.
- **[Anthropic](https://radaschat.com/discover/provider/anthropic)**: Anthropic is a company focused on AI research and development, offering a range of advanced language models such as Claude 3.5 Sonnet, Claude 3 Sonnet, Claude 3 Opus, and Claude 3 Haiku. These models achieve an ideal balance between intelligence, speed, and cost, suitable for various applications from enterprise workloads to rapid-response scenarios. Claude 3.5 Sonnet, as their latest model, has excelled in multiple evaluations while maintaining a high cost-performance ratio.
- **[Bedrock](https://radaschat.com/discover/provider/bedrock)**: Bedrock is a service provided by Amazon AWS, focusing on delivering advanced AI language and visual models for enterprises. Its model family includes Anthropic's Claude series, Meta's Llama 3.1 series, and more, offering a range of options from lightweight to high-performance, supporting tasks such as text generation, conversation, and image processing for businesses of varying scales and needs.
- **[Google](https://radaschat.com/discover/provider/google)**: Google's Gemini series represents its most advanced, versatile AI models, developed by Google DeepMind, designed for multimodal capabilities, supporting seamless understanding and processing of text, code, images, audio, and video. Suitable for various environments from data centers to mobile devices, it significantly enhances the efficiency and applicability of AI models.
- **[DeepSeek](https://radaschat.com/discover/provider/deepseek)**: DeepSeek is a company focused on AI technology research and application, with its latest model DeepSeek-V2.5 integrating general dialogue and code processing capabilities, achieving significant improvements in human preference alignment, writing tasks, and instruction following.
- **[PPIO](https://radaschat.com/discover/provider/ppio)**: PPIO supports stable and cost-efficient open-source LLM APIs, such as DeepSeek, Llama, Qwen etc.
- **[HuggingFace](https://radaschat.com/discover/provider/huggingface)**: The HuggingFace Inference API provides a fast and free way for you to explore thousands of models for various tasks. Whether you are prototyping for a new application or experimenting with the capabilities of machine learning, this API gives you instant access to high-performance models across multiple domains.
- **[OpenRouter](https://radaschat.com/discover/provider/openrouter)**: OpenRouter is a service platform providing access to various cutting-edge large model interfaces, supporting OpenAI, Anthropic, LLaMA, and more, suitable for diverse development and application needs. Users can flexibly choose the optimal model and pricing based on their requirements, enhancing the AI experience.
- **[Cloudflare Workers AI](https://radaschat.com/discover/provider/cloudflare)**: Run serverless GPU-powered machine learning models on Cloudflare's global network.

<details><summary><kbd>See more providers (+31)</kbd></summary>

- **[GitRadasHub](https://radaschat.com/discover/provider/github)**: With GitRadasHub Models, developers can become AI engineers and leverage the industry's leading AI models.
- **[Novita](https://radaschat.com/discover/provider/novita)**: Novita AI is a platform providing a variety of large language models and AI image generation API services, flexible, reliable, and cost-effective. It supports the latest open-source models like Llama3 and Mistral, offering a comprehensive, user-friendly, and auto-scaling API solution for generative AI application development, suitable for the rapid growth of AI startups.
- **[PPIO](https://radaschat.com/discover/provider/ppio)**: PPIO supports stable and cost-efficient open-source LLM APIs, such as DeepSeek, Llama, Qwen etc.
- **[Together AI](https://radaschat.com/discover/provider/togetherai)**: Together AI is dedicated to achieving leading performance through innovative AI models, offering extensive customization capabilities, including rapid scaling support and intuitive deployment processes to meet various enterprise needs.
- **[Fireworks AI](https://radaschat.com/discover/provider/fireworksai)**: Fireworks AI is a leading provider of advanced language model services, focusing on functional calling and multimodal processing. Its latest model, Firefunction V2, is based on Llama-3, optimized for function calling, conversation, and instruction following. The visual language model FireLLaVA-13B supports mixed input of images and text. Other notable models include the Llama series and Mixtral series, providing efficient multilingual instruction following and generation support.
- **[Groq](https://radaschat.com/discover/provider/groq)**: Groq's LPU inference engine has excelled in the latest independent large language model (LLM) benchmarks, redefining the standards for AI solutions with its remarkable speed and efficiency. Groq represents instant inference speed, demonstrating strong performance in cloud-based deployments.
- **[Perplexity](https://radaschat.com/discover/provider/perplexity)**: Perplexity is a leading provider of conversational generation models, offering various advanced Llama 3.1 models that support both online and offline applications, particularly suited for complex natural language processing tasks.
- **[Mistral](https://radaschat.com/discover/provider/mistral)**: Mistral provides advanced general, specialized, and research models widely used in complex reasoning, multilingual tasks, and code generation. Through functional calling interfaces, users can integrate custom functionalities for specific applications.
- **[Ai21Labs](https://radaschat.com/discover/provider/ai21)**: AI21 Labs builds foundational models and AI systems for enterprises, accelerating the application of generative AI in production.
- **[Upstage](https://radaschat.com/discover/provider/upstage)**: Upstage focuses on developing AI models for various business needs, including Solar LLM and document AI, aiming to achieve artificial general intelligence (AGI) for work. It allows for the creation of simple conversational agents through Chat API and supports functional calling, translation, embedding, and domain-specific applications.
- **[xAI](https://radaschat.com/discover/provider/xai)**: xAI is a company dedicated to building artificial intelligence to accelerate human scientific discovery. Our mission is to advance our collective understanding of the universe.
- **[Qwen](https://radaschat.com/discover/provider/qwen)**: Tongyi Qianwen is a large-scale language model independently developed by Alibaba Cloud, featuring strong natural language understanding and generation capabilities. It can answer various questions, create written content, express opinions, and write code, playing a role in multiple fields.
- **[Wenxin](https://radaschat.com/discover/provider/wenxin)**: An enterprise-level one-stop platform for large model and AI-native application development and services, providing the most comprehensive and user-friendly toolchain for the entire process of generative artificial intelligence model development and application development.
- **[Hunyuan](https://radaschat.com/discover/provider/hunyuan)**: A large language model developed by Tencent, equipped with powerful Chinese creative capabilities, logical reasoning abilities in complex contexts, and reliable task execution skills.
- **[ZhiPu](https://radaschat.com/discover/provider/zhipu)**: Zhipu AI offers an open platform for multimodal and language models, supporting a wide range of AI application scenarios, including text processing, image understanding, and programming assistance.
- **[SiliconCloud](https://radaschat.com/discover/provider/siliconcloud)**: SiliconFlow is dedicated to accelerating AGI for the benefit of humanity, enhancing large-scale AI efficiency through an easy-to-use and cost-effective GenAI stack.
- **[01.AI](https://radaschat.com/discover/provider/zeroone)**: 01.AI focuses on AI 2.0 era technologies, vigorously promoting the innovation and application of 'human + artificial intelligence', using powerful models and advanced AI technologies to enhance human productivity and achieve technological empowerment.
- **[Spark](https://radaschat.com/discover/provider/spark)**: iFlytek's Spark model provides powerful AI capabilities across multiple domains and languages, utilizing advanced natural language processing technology to build innovative applications suitable for smart hardware, smart healthcare, smart finance, and other vertical scenarios.
- **[SenseNova](https://radaschat.com/discover/provider/sensenova)**: SenseNova, backed by SenseTime's robust infrastructure, offers efficient and user-friendly full-stack large model services.
- **[Stepfun](https://radaschat.com/discover/provider/stepfun)**: StepFun's large model possesses industry-leading multimodal and complex reasoning capabilities, supporting ultra-long text understanding and powerful autonomous scheduling search engine functions.
- **[Moonshot](https://radaschat.com/discover/provider/moonshot)**: Moonshot is an open-source platform launched by Beijing Dark Side Technology Co., Ltd., providing various natural language processing models with a wide range of applications, including but not limited to content creation, academic research, intelligent recommendations, and medical diagnosis, supporting long text processing and complex generation tasks.
- **[Baichuan](https://radaschat.com/discover/provider/baichuan)**: Baichuan Intelligence is a company focused on the research and development of large AI models, with its models excelling in domestic knowledge encyclopedias, long text processing, and generative creation tasks in Chinese, surpassing mainstream foreign models. Baichuan Intelligence also possesses industry-leading multimodal capabilities, performing excellently in multiple authoritative evaluations. Its models include Baichuan 4, Baichuan 3 Turbo, and Baichuan 3 Turbo 128k, each optimized for different application scenarios, providing cost-effective solutions.
- **[Minimax](https://radaschat.com/discover/provider/minimax)**: MiniMax is a general artificial intelligence technology company established in 2021, dedicated to co-creating intelligence with users. MiniMax has independently developed general large models of different modalities, including trillion-parameter MoE text models, voice models, and image models, and has launched applications such as Conch AI.
- **[InternLM](https://radaschat.com/discover/provider/internlm)**: An open-source organization dedicated to the research and development of large model toolchains. It provides an efficient and user-friendly open-source platform for all AI developers, making cutting-edge large models and algorithm technologies easily accessible.
- **[Higress](https://radaschat.com/discover/provider/higress)**: Higress is a cloud-native API gateway that was developed internally at Alibaba to address the issues of Tengine reload affecting long-lived connections and the insufficient load balancing capabilities for gRPC/Dubbo.
- **[Gitee AI](https://radaschat.com/discover/provider/giteeai)**: Gitee AI's Serverless API provides AI developers with an out of the box large model inference API service.
- **[Taichu](https://radaschat.com/discover/provider/taichu)**: The Institute of Automation, Chinese Academy of Sciences, and Wuhan Artificial Intelligence Research Institute have launched a new generation of multimodal large models, supporting comprehensive question-answering tasks such as multi-turn Q&A, text creation, image generation, 3D understanding, and signal analysis, with stronger cognitive, understanding, and creative abilities, providing a new interactive experience.
- **[360 AI](https://radaschat.com/discover/provider/ai360)**: 360 AI is an AI model and service platform launched by 360 Company, offering various advanced natural language processing models, including 360GPT2 Pro, 360GPT Pro, 360GPT Turbo, and 360GPT Turbo Responsibility 8K. These models combine large-scale parameters and multimodal capabilities, widely applied in text generation, semantic understanding, dialogue systems, and code generation. With flexible pricing strategies, 360 AI meets diverse user needs, supports developer integration, and promotes the innovation and development of intelligent applications.
- **[Search1API](https://radaschat.com/discover/provider/search1api)**: Search1API provides access to the DeepSeek series of models that can connect to the internet as needed, including standard and fast versions, supporting a variety of model sizes.
- **[InfiniAI](https://radaschat.com/discover/provider/infiniai)**: Provides high-performance, easy-to-use, and secure large model services for application developers, covering the entire process from large model development to service deployment.
- **[Qiniu](https://radaschat.com/discover/provider/qiniu)**: Qiniu, as a long-established cloud service provider, delivers cost-effective and reliable AI inference services for both real-time and batch processing, with a simple and user-friendly experience.

</details>

> 📊 Total providers: [<kbd>**41**</kbd>](https://radaschat.com/discover/providers)

 <!-- PROVIDER LIST -->

At the same time, we are also planning to support more model service providers. If you would like RadasChat to support your favorite service provider, feel free to join our [💬 community discussion](https://github.com/radashub/radas-chat/discussions/1284).

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-local]][docs-feat-local]

### `6` [Local Large Language Model (LLM) Support][docs-feat-local]

To meet the specific needs of users, RadasChat also supports the use of local models based on [Ollama](https://ollama.ai), allowing users to flexibly use their own or third-party models.

> \[!TIP]
>
> Learn more about [📘 Using Ollama in RadasChat][docs-usage-ollama] by checking it out.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-vision]][docs-feat-vision]

### `7` [Model Visual Recognition][docs-feat-vision]

RadasChat now supports OpenAI's latest [`gpt-4-vision`](https://platform.openai.com/docs/guides/vision) model with visual recognition capabilities,
a multimodal intelligence that can perceive visuals. Users can easily upload or drag and drop images into the dialogue box,
and the agent will be able to recognize the content of the images and engage in intelligent conversation based on this,
creating smarter and more diversified chat scenarios.

This feature opens up new interactive methods, allowing communication to transcend text and include a wealth of visual elements.
Whether it's sharing images in daily use or interpreting images within specific industries, the agent provides an outstanding conversational experience.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-tts]][docs-feat-tts]

### `8` [TTS & STT Voice Conversation][docs-feat-tts]

RadasChat supports Text-to-Speech (TTS) and Speech-to-Text (STT) technologies, enabling our application to convert text messages into clear voice outputs,
allowing users to interact with our conversational agent as if they were talking to a real person. Users can choose from a variety of voices to pair with the agent.

Moreover, TTS offers an excellent solution for those who prefer auditory learning or desire to receive information while busy.
In RadasChat, we have meticulously selected a range of high-quality voice options (OpenAI Audio, Microsoft Edge Speech) to meet the needs of users from different regions and cultural backgrounds.
Users can choose the voice that suits their personal preferences or specific scenarios, resulting in a personalized communication experience.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-t2i]][docs-feat-t2i]

### `9` [Text to Image Generation][docs-feat-t2i]

With support for the latest text-to-image generation technology, RadasChat now allows users to invoke image creation tools directly within conversations with the agent. By leveraging the capabilities of AI tools such as [`DALL-E 3`](https://openai.com/dall-e-3), [`MidJourney`](https://www.midjourney.com/), and [`Pollinations`](https://pollinations.ai/), the agents are now equipped to transform your ideas into images.

This enables a more private and immersive creative process, allowing for the seamless integration of visual storytelling into your personal dialogue with the agent.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-plugin]][docs-feat-plugin]

### `10` [Plugin System (Function Calling)][docs-feat-plugin]

The plugin ecosystem of RadasChat is an important extension of its core functionality, greatly enhancing the practicality and flexibility of the RadasChat assistant.

<video controls src="https://github.com/radashub/radas-chat/assets/28616219/f29475a3-f346-4196-a435-41a6373ab9e2" muted="false"></video>

By utilizing plugins, RadasChat assistants can obtain and process real-time information, such as searching for web information and providing users with instant and relevant news.

In addition, these plugins are not limited to news aggregation, but can also extend to other practical functions, such as quickly searching documents, generating images, obtaining data from various platforms like Bilibili, Steam, and interacting with various third-party services.

> \[!TIP]
>
> Learn more about [📘 Plugin Usage][docs-usage-plugin] by checking it out.

<!-- PLUGIN LIST -->

| Recent Submits                                                                                                               | Description                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [PortfolioMeta](https://radaschat.com/discover/plugin/StockData)<br/><sup>By **portfoliometa** on **2025-03-23**</sup>        | Analyze stocks and get comprehensive real-time investment data and analytics.<br/>`stock`                               |
| [Web](https://radaschat.com/discover/plugin/web)<br/><sup>By **Proghit** on **2025-01-24**</sup>                              | Smart web search that reads and analyzes pages to deliver comprehensive answers from Google results.<br/>`web` `search` |
| [Bing_websearch](https://radaschat.com/discover/plugin/Bingsearch-identifier)<br/><sup>By **FineHow** on **2024-12-22**</sup> | Search for information from the internet base BingApi<br/>`bingsearch`                                                  |
| [Google CSE](https://radaschat.com/discover/plugin/google-cse)<br/><sup>By **vsnthdev** on **2024-12-02**</sup>               | Searches Google through their official CSE API.<br/>`web` `search`                                                      |

> 📊 Total plugins: [<kbd>**43**</kbd>](https://radaschat.com/discover/plugins)

 <!-- PLUGIN LIST -->

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-agent]][docs-feat-agent]

### `11` [Agent Market (GPTs)][docs-feat-agent]

In RadasChat Agent Marketplace, creators can discover a vibrant and innovative community that brings together a multitude of well-designed agents,
which not only play an important role in work scenarios but also offer great convenience in learning processes.
Our marketplace is not just a showcase platform but also a collaborative space. Here, everyone can contribute their wisdom and share the agents they have developed.

> \[!TIP]
>
> By [🤖/🏪 Submit Agents][submit-agents-link], you can easily submit your agent creations to our platform.
> Importantly, RadasChat has established a sophisticated automated internationalization (i18n) workflow,
> capable of seamlessly translating your agent into multiple language versions.
> This means that no matter what language your users speak, they can experience your agent without barriers.

> \[!IMPORTANT]
>
> We welcome all users to join this growing ecosystem and participate in the iteration and optimization of agents.
> Together, we can create more interesting, practical, and innovative agents, further enriching the diversity and practicality of the agent offerings.

<!-- AGENT LIST -->

| Recent Submits                                                                                                                                                                                        | Description                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [学术论文综述专家](https://radaschat.com/discover/assistant/academic-paper-overview)<br/><sup>By **[arvinxx](https://github.com/arvinxx)** on **2025-03-11**</sup>                                     | 擅长高质量文献检索与分析的学术研究助手<br/>`学术研究` `文献检索` `数据分析` `信息提取` `咨询`                                                                    |
| [Cron Expression Assistant](https://radaschat.com/discover/assistant/crontab-generate)<br/><sup>By **[edgesider](https://github.com/edgesider)** on **2025-02-17**</sup>                               | Crontab Expression Generator<br/>`crontab` `time-expression` `trigger-time` `generator` `technical-assistance`                                                   |
| [Xiao Zhi French Translation Assistant](https://radaschat.com/discover/assistant/xiao-zhi-french-translation-asst-v-1)<br/><sup>By **[WeR-Best](https://github.com/WeR-Best)** on **2025-02-10**</sup> | A friendly, professional, and empathetic AI assistant for French translation<br/>`ai-assistant` `french-translation` `cross-cultural-communication` `creativity` |
| [Investment Assistant](https://radaschat.com/discover/assistant/graham-investmentassi)<br/><sup>By **[farsightlin](https://github.com/farsightlin)** on **2025-02-06**</sup>                           | Helps users calculate the data needed for valuation<br/>`investment` `valuation` `financial-analysis` `calculator`                                               |

> 📊 Total agents: [<kbd>**488**</kbd> ](https://radaschat.com/discover/assistants)

 <!-- AGENT LIST -->

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-database]][docs-feat-database]

### `12` [Support Local / Remote Database][docs-feat-database]

RadasChat supports the use of both server-side and local databases. Depending on your needs, you can choose the appropriate deployment solution:

- **Local database**: suitable for users who want more control over their data and privacy protection. RadasChat uses CRDT (Conflict-Free Replicated Data Type) technology to achieve multi-device synchronization. This is an experimental feature aimed at providing a seamless data synchronization experience.
- **Server-side database**: suitable for users who want a more convenient user experience. RadasChat supports PostgreSQL as a server-side database. For detailed documentation on how to configure the server-side database, please visit [Configure Server-side Database](https://radas.raizora.com/docs/self-hosting/advanced/server-database).

Regardless of which database you choose, RadasChat can provide you with an excellent user experience.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-auth]][docs-feat-auth]

### `13` [Support Multi-User Management][docs-feat-auth]

RadasChat supports multi-user management and provides two main user authentication and management solutions to meet different needs:

- **next-auth**: RadasChat integrates `next-auth`, a flexible and powerful identity verification library that supports multiple authentication methods, including OAuth, email login, credential login, etc. With `next-auth`, you can easily implement user registration, login, session management, social login, and other functions to ensure the security and privacy of user data.

- [**Clerk**](https://go.clerk.com/exgqLG0): For users who need more advanced user management features, RadasChat also supports `Clerk`, a modern user management platform. `Clerk` provides richer functions, such as multi-factor authentication (MFA), user profile management, login activity monitoring, etc. With `Clerk`, you can get higher security and flexibility, and easily cope with complex user management needs.

Regardless of which user management solution you choose, RadasChat can provide you with an excellent user experience and powerful functional support.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-pwa]][docs-feat-pwa]

### `14` [Progressive Web App (PWA)][docs-feat-pwa]

We deeply understand the importance of providing a seamless experience for users in today's multi-device environment.
Therefore, we have adopted Progressive Web Application ([PWA](https://support.google.com/chrome/answer/9658361)) technology,
a modern web technology that elevates web applications to an experience close to that of native apps.

Through PWA, RadasChat can offer a highly optimized user experience on both desktop and mobile devices while maintaining its lightweight and high-performance characteristics.
Visually and in terms of feel, we have also meticulously designed the interface to ensure it is indistinguishable from native apps,
providing smooth animations, responsive layouts, and adapting to different device screen resolutions.

> \[!NOTE]
>
> If you are unfamiliar with the installation process of PWA, you can add RadasChat as your desktop application (also applicable to mobile devices) by following these steps:
>
> - Launch the Chrome or Edge browser on your computer.
> - Visit the RadasChat webpage.
> - In the upper right corner of the address bar, click on the <kbd>Install</kbd> icon.
> - Follow the instructions on the screen to complete the PWA Installation.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-mobile]][docs-feat-mobile]

### `15` [Mobile Device Adaptation][docs-feat-mobile]

We have carried out a series of optimization designs for mobile devices to enhance the user's mobile experience. Currently, we are iterating on the mobile user experience to achieve smoother and more intuitive interactions. If you have any suggestions or ideas, we welcome you to provide feedback through GitRadasHub Issues or Pull Requests.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

[![][image-feat-theme]][docs-feat-theme]

### `16` [Custom Themes][docs-feat-theme]

As a design-engineering-oriented application, RadasChat places great emphasis on users' personalized experiences,
hence introducing flexible and diverse theme modes, including a light mode for daytime and a dark mode for nighttime.
Beyond switching theme modes, a range of color customization options allow users to adjust the application's theme colors according to their preferences.
Whether it's a desire for a sober dark blue, a lively peach pink, or a professional gray-white, users can find their style of color choices in RadasChat.

> \[!TIP]
>
> The default configuration can intelligently recognize the user's system color mode and automatically switch themes to ensure a consistent visual experience with the operating system.
> For users who like to manually control details, RadasChat also offers intuitive setting options and a choice between chat bubble mode and document mode for conversation scenarios.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

### `*` What's more

Beside these features, RadasChat also have much better basic technique underground:

- [x] 💨 **Quick Deployment**: Using the Vercel platform or docker image, you can deploy with just one click and complete the process within 1 minute without any complex configuration.
- [x] 🌐 **Custom Domain**: If users have their own domain, they can bind it to the platform for quick access to the dialogue agent from anywhere.
- [x] 🔒 **Privacy Protection**: All data is stored locally in the user's browser, ensuring user privacy.
- [x] 💎 **Exquisite UI Design**: With a carefully designed interface, it offers an elegant appearance and smooth interaction. It supports light and dark themes and is mobile-friendly. PWA support provides a more native-like experience.
- [x] 🗣️ **Smooth Conversation Experience**: Fluid responses ensure a smooth conversation experience. It fully supports Markdown rendering, including code highlighting, LaTex formulas, Mermaid flowcharts, and more.

> ✨ more features will be added when RadasChat evolve.

---

> \[!NOTE]
>
> You can find our upcoming [Roadmap][github-project-link] plans in the Projects section.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## ⚡️ Performance

> \[!NOTE]
>
> The complete list of reports can be found in the [📘 Lighthouse Reports][docs-lighthouse]

|                   Desktop                   |                   Mobile                   |
| :-----------------------------------------: | :----------------------------------------: |
|              ![][chat-desktop]              |              ![][chat-mobile]              |
| [📑 Lighthouse Report][chat-desktop-report] | [📑 Lighthouse Report][chat-mobile-report] |

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 🛳 Self Hosting

RadasChat provides Self-Hosted Version with Vercel, Alibaba Cloud, and [Docker Image][docker-release-link]. This allows you to deploy your own chatbot within a few minutes without any prior knowledge.

> \[!TIP]
>
> Learn more about [📘 Build your own RadasChat][docs-self-hosting] by checking it out.

### `A` Deploying with Vercel, Zeabur , Sealos or Alibaba Cloud

"If you want to deploy this service yourself on Vercel, Zeabur or Alibaba Cloud, you can follow these steps:

- Prepare your [OpenAI API Key](https://platform.openai.com/account/api-keys).
- Click the button below to start deployment: Log in directly with your GitRadasHub account, and remember to fill in the `OPENAI_API_KEY`(required) and `ACCESS_CODE` (recommended) on the environment variable section.
- After deployment, you can start using it.
- Bind a custom domain (optional): The DNS of the domain assigned by Vercel is polluted in some areas; binding a custom domain can connect directly.

<div align="center">

|           Deploy with Vercel            |                     Deploy with Zeabur                      |                     Deploy with Sealos                      |                       Deploy with RepoCloud                       |                         Deploy with Alibaba Cloud                         |
| :-------------------------------------: | :---------------------------------------------------------: | :---------------------------------------------------------: | :---------------------------------------------------------------: | :-----------------------------------------------------------------------: |
| [![][deploy-button-image]][deploy-link] | [![][deploy-on-zeabur-button-image]][deploy-on-zeabur-link] | [![][deploy-on-sealos-button-image]][deploy-on-sealos-link] | [![][deploy-on-repocloud-button-image]][deploy-on-repocloud-link] | [![][deploy-on-alibaba-cloud-button-image]][deploy-on-alibaba-cloud-link] |

</div>

#### After Fork

After fork, only retain the upstream sync action and disable other actions in your repository on GitRadasHub.

#### Keep Updated

If you have deployed your own project following the one-click deployment steps in the README, you might encounter constant prompts indicating "updates available." This is because Vercel defaults to creating a new project instead of forking this one, resulting in an inability to detect updates accurately.

> \[!TIP]
>
> We suggest you redeploy using the following steps, [📘 Auto Sync With Latest][docs-upstream-sync]

<br/>

### `B` Deploying with Docker

[![][docker-release-shield]][docker-release-link]
[![][docker-size-shield]][docker-size-link]
[![][docker-pulls-shield]][docker-pulls-link]

We provide a Docker image for deploying the RadasChat service on your own private device. Use the following command to start the RadasChat service:

1. create a folder to for storage files

```fish
$ mkdir radas-chat-db && cd radas-chat-db
```

2. init the RadasChat infrastructure

```fish
bash <(curl -fsSL https://radas.li/setup.sh)
```

3. Start the RadasChat service

```fish
docker compose up -d
```

> \[!NOTE]
>
> For detailed instructions on deploying with Docker, please refer to the [📘 Docker Deployment Guide][docs-docker]

<br/>

### Environment Variable

This project provides some additional configuration items set with environment variables:

| Environment Variable | Required | Description                                                                                                                                                               | Example                                                                                                              |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | Yes      | This is the API key you apply on the OpenAI account page                                                                                                                  | `sk-xxxxxx...xxxxxx`                                                                                                 |
| `OPENAI_PROXY_URL`   | No       | If you manually configure the OpenAI interface proxy, you can use this configuration item to override the default OpenAI API request base URL                             | `https://api.chatanywhere.cn` or `https://aihubmix.com/v1` <br/>The default value is<br/>`https://api.openai.com/v1` |
| `ACCESS_CODE`        | No       | Add a password to access this service; you can set a long password to avoid leaking. If this value contains a comma, it is a password array.                              | `awCTe)re_r74` or `rtrt_ewee3@09!` or `code1,code2,code3`                                                            |
| `OPENAI_MODEL_LIST`  | No       | Used to control the model list. Use `+` to add a model, `-` to hide a model, and `model_name=display_name` to customize the display name of a model, separated by commas. | `qwen-7b-chat,+glm-6b,-gpt-3.5-turbo`                                                                                |

> \[!NOTE]
>
> The complete list of environment variables can be found in the [📘 Environment Variables][docs-env-var]

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 📦 Ecosystem

| NPM                               | Repository                              | Description                                                                                           | Version                                   |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [@radashub/ui][radas-ui-link]       | [radashub/radas-ui][radas-ui-github]       | Open-source UI component library dedicated to building AIGC web applications.                         | [![][radas-ui-shield]][radas-ui-link]       |
| [@radashub/icons][radas-icons-link] | [radashub/radas-icons][radas-icons-github] | Popular AI / LLM Model Brand SVG Logo and Icon Collection.                                            | [![][radas-icons-shield]][radas-icons-link] |
| [@radashub/tts][radas-tts-link]     | [radashub/radas-tts][radas-tts-github]     | High-quality & reliable TTS/STT React Hooks library                                                   | [![][radas-tts-shield]][radas-tts-link]     |
| [@radashub/lint][radas-lint-link]   | [radashub/radas-lint][radas-lint-github]   | Configurations for ESlint, Stylelint, Commitlint, Prettier, Remark, and Semantic Release for RadasRadasHub. | [![][radas-lint-shield]][radas-lint-link]   |

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 🧩 Plugins

Plugins provide a means to extend the [Function Calling][docs-functionc-call] capabilities of RadasChat. They can be used to introduce new function calls and even new ways to render message results. If you are interested in plugin development, please refer to our [📘 Plugin Development Guide][docs-plugin-dev] in the Wiki.

- [radas-chat-plugins][radas-chat-plugins]: This is the plugin index for RadasChat. It accesses index.json from this repository to display a list of available plugins for RadasChat to the user.
- [chat-plugin-template][chat-plugin-template]: This is the plugin template for RadasChat plugin development.
- [@radashub/chat-plugin-sdk][chat-plugin-sdk]: The RadasChat Plugin SDK assists you in creating exceptional chat plugins for Radas.
- [@radashub/chat-plugins-gateway][chat-plugins-gateway]: The RadasChat Plugins Gateway is a backend service that provides a gateway for RadasChat plugins. We deploy this service using Vercel. The primary API POST /api/v1/runner is deployed as an Edge Function.

> \[!NOTE]
>
> The plugin system is currently undergoing major development. You can learn more in the following issues:
>
> - [x] [**Plugin Phase 1**](https://github.com/radashub/radas-chat/issues/73): Implement separation of the plugin from the main body, split the plugin into an independent repository for maintenance, and realize dynamic loading of the plugin.
> - [x] [**Plugin Phase 2**](https://github.com/radashub/radas-chat/issues/97): The security and stability of the plugin's use, more accurately presenting abnormal states, the maintainability of the plugin architecture, and developer-friendly.
> - [x] [**Plugin Phase 3**](https://github.com/radashub/radas-chat/issues/149): Higher-level and more comprehensive customization capabilities, support for plugin authentication, and examples.

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## ⌨️ Local Development

You can use GitRadasHub Codespaces for online development:

[![][codespaces-shield]][codespaces-link]

Or clone it for local development:

```fish
$ git clone https://github.com/radashub/radas-chat.git
$ cd radas-chat
$ pnpm install
$ pnpm dev
```

If you would like to learn more details, please feel free to look at our [📘 Development Guide][docs-dev-guide].

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 🤝 Contributing

Contributions of all types are more than welcome; if you are interested in contributing code, feel free to check out our GitRadasHub [Issues][github-issues-link] and [Projects][github-project-link] to get stuck in to show us what you're made of.

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
[image-banner]: https://github.com/user-attachments/assets/6f293c7f-47b4-47eb-9202-fe68a942d35b
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