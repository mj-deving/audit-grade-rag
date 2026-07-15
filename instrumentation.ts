import Anthropic from "@anthropic-ai/sdk";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

// Official best-practice for the Anthropic JS/TS SDK: auto-instrument via OpenInference
// (prefer integration over manual wrapping). Under ESM/tsx the auto-patch does not fire,
// so manuallyInstrument(Anthropic) is required. Captures model, tokens, input/output and
// the correct generation observation type automatically on every Anthropic call.
const anthropicInstrumentation = new AnthropicInstrumentation();
anthropicInstrumentation.manuallyInstrument(Anthropic);

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
  instrumentations: [anthropicInstrumentation],
});

sdk.start();
