# Configure models

English | [中文](providers.zh.md)

This guide covers the Web UI and the same user settings consumed by the TUI. Start either interface through the [root README](../../../README.md#run). Model changes take effect on the next request without restarting the running interface.

## Configure DeepSeek

Open **Settings → Models**. The DeepSeek card exposes one API-key field; enter the key and save it.

![The Models page: the DeepSeek card, with Add provider and Add a custom provider below it](providers-models-page.png)

Keys are write-only. The page receives a redacted descriptor after saving, never the literal secret. The key is stored in `$DSH_HOME/.credentials.yaml`, while settings retain only its credential reference.

## Add a catalog provider

Choose **Add provider**, select a provider such as Anthropic or OpenAI, enter its API key, and save. The installed catalog supplies the endpoint, protocol, and model list.

Providers with native authentication need their native credentials instead. Bedrock, Vertex, Azure, and Codex use AWS credentials and a region, an ADC project, an `api-version`, and OAuth respectively; filling only the API-key field does not configure them.

## Add a custom provider

Choose **Add a custom provider** for a company gateway, self-hosted server, or provider absent from the installed catalog. Supply a lowercase Provider ID, base URL, API protocol, credential, and at least one model.

![The custom provider form: Provider ID, display name, base URL, API protocol, and API key](providers-custom-form.png)

The Provider ID is permanent because requests, saved sessions, model defaults, and credential references use it. To rename a provider, add a new provider and delete the old one. The display name, base URL, protocol, credential, and models remain editable.

Under **Model catalog**, choose **Fetch available models** to query the base URL and credential currently shown in the form. Selecting candidates updates the draft; the provider is not stored until you save. Catalog providers use their installed catalog without a network request.

## MaaS configuration recipes

The following services expose OpenAI-compatible Chat Completions endpoints and work through `llm-pi-ai`. Copy only the provider you use into `$DSH_HOME/settings.yaml`, set the referenced environment variable, and replace the sample model id with an exact id available to your account. Model catalogs and regional availability change independently of Harness.

### Volcengine Ark

Ark uses an endpoint or model id created in the console. The base URL ends at `/api/v3`; Harness appends the request path. See the [official OpenAI SDK compatibility guide](https://www.volcengine.com/docs/82379/1330626).

```yaml
llm-pi-ai:
  providers:
    volcengine:
      displayName: Volcengine Ark
      apiKeyEnv: ARK_API_KEY
      api: openai-completions
      baseURL: https://ark.cn-beijing.volces.com/api/v3
      models:
        - id: your-endpoint-or-model-id
```

### SiliconFlow

SiliconFlow model ids include the publisher, such as `deepseek-ai/DeepSeek-R1`. Copy the current id from the [SiliconFlow model catalog](https://siliconflow.com/models) and use the endpoint from its [official quickstart](https://docs.siliconflow.com/en/userguide/quickstart).

```yaml
llm-pi-ai:
  providers:
    siliconflow:
      displayName: SiliconFlow
      apiKeyEnv: SILICONFLOW_API_KEY
      api: openai-completions
      baseURL: https://api.siliconflow.com/v1
      models:
        - id: deepseek-ai/DeepSeek-R1
```

### OpenRouter

OpenRouter model ids use `publisher/model`. The [model directory](https://openrouter.ai/models) supplies the current ids, and the [OpenAI SDK guide](https://openrouter.ai/docs/guides/community/openai-sdk) owns endpoint details.

```yaml
llm-pi-ai:
  providers:
    openrouter:
      displayName: OpenRouter
      apiKeyEnv: OPENROUTER_API_KEY
      api: openai-completions
      baseURL: https://openrouter.ai/api/v1
      models:
        - id: deepseek/deepseek-r1
```

### Alibaba Cloud Model Studio

API keys and endpoints are regional. This example uses the shared Beijing endpoint; replace it with the workspace endpoint shown in your console when applicable. The [OpenAI compatibility guide](https://help.aliyun.com/en/model-studio/compatibility-of-openai-with-dashscope) lists current regions and model ids.

```yaml
llm-pi-ai:
  providers:
    model-studio:
      displayName: Alibaba Cloud Model Studio
      apiKeyEnv: DASHSCOPE_API_KEY
      api: openai-completions
      baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
      models:
        - id: qwen-plus
```

### Together AI

Together model ids use `publisher/model`. Choose an available chat model from the [model library](https://www.together.ai/models); the [OpenAI compatibility guide](https://docs.together.ai/docs/inference/openai-compatibility) owns endpoint behavior.

```yaml
llm-pi-ai:
  providers:
    together:
      displayName: Together AI
      apiKeyEnv: TOGETHER_API_KEY
      api: openai-completions
      baseURL: https://api.together.ai/v1
      models:
        - id: deepseek-ai/DeepSeek-V3
```

### Fireworks AI

Fireworks serverless model ids use `accounts/fireworks/models/<model>`. Copy the current id from the [model library](https://fireworks.ai/models); the [OpenAI compatibility guide](https://docs.fireworks.ai/tools-sdks/openai-compatibility) owns endpoint behavior.

```yaml
llm-pi-ai:
  providers:
    fireworks:
      displayName: Fireworks AI
      apiKeyEnv: FIREWORKS_API_KEY
      api: openai-completions
      baseURL: https://api.fireworks.ai/inference/v1
      models:
        - id: accounts/fireworks/models/your-model
```

After saving, select the route as `provider/model-id`. For example, `pnpm dsh tui --model siliconflow/deepseek-ai/DeepSeek-R1` selects the SiliconFlow recipe above. A model id containing `/` remains part of the model id after the first route separator.

### Image input

A model you enter by hand is treated as text-only until it says otherwise, because nothing can ask an endpoint which modalities it accepts. Attaching an image to such a model is refused before it is sent, naming the model.

A vision model on a custom provider therefore needs one line. The form has no field for it; add `input` to the model in `$DSH_HOME/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` accepts `text` and `image`, and applies to that model alone, so one route can serve both kinds. Omitting it — or writing an empty list, which means the same thing — keeps whatever the installed catalog records for that model, and falls back to the route's `defaultInput` for a model the catalog does not describe.

If every model you entered by hand takes images, set the fallback once on the route instead of on each of them:

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` is a fallback, not an override, and defaults to `[text]`: on a catalog provider it answers only for models the catalog does not describe, so it never removes images from a catalog model that has them. Narrow one of those with that model's own `input`. A catalog provider has no `models` list to put it in, so write it under `modelOverrides`, keyed by model id:

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

Every list must name at least one modality except a model's own, where an empty list means the same as omitting it. An unknown modality is refused wherever it is written.

Both fields state a claim about your endpoint rather than checking it. A model that declares images its endpoint does not serve is not caught here; the provider rejects the request instead.

## Select a model

Configured providers appear in the model picker. Selecting a model also makes it the default for new sessions. A session that has already sent a request retains the model recorded in its own log.

If a saved default names a provider that was deleted, the composer displays **Select model** and blocks input until another model is selected.

## Troubleshooting

- **`MISSING_CREDENTIAL`** — Store the provider key through the Models page or supply the referenced environment variable.
- **`UNKNOWN_MODEL`** — Select a configured model or add the missing model to the custom provider.
- **Fetching available models returns 401** — Check the key. Model discovery calls the OpenAI-compatible `GET /models` endpoint; enter models manually for endpoints that do not provide it.
- **An image is refused before sending** — The model declares no image modality. Give a custom provider's model `input: [text, image]`; DeepSeek's own chat-completions route is text-only and cannot be configured otherwise.
- **The provider rejects a request carrying an image** — The model declares images its endpoint does not actually serve. Remove `image` from whichever list granted it — the model's `input`, or the route's `defaultInput` — then start a new session: the attached image stays in the session log, so the same request repeats until the session moves off it.

## Advanced configuration

The generated [plugin configuration catalog](../../config-catalog.md) lists every supported field and default. The [`dsh-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.md) and [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.md) references own direct `settings.yaml` configuration, catalog resolution, reasoning controls, credentials, and adapter errors.
