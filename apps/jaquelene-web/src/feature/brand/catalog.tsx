import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import aionLabsIcon from "@lobehub/icons-static-svg/icons/aionlabs.svg?no-inline";
import anthropicIcon from "@lobehub/icons-static-svg/icons/anthropic.svg?no-inline";
import arceeIcon from "@lobehub/icons-static-svg/icons/arcee.svg?no-inline";
import awsIcon from "@lobehub/icons-static-svg/icons/aws.svg?no-inline";
import byteDanceIcon from "@lobehub/icons-static-svg/icons/bytedance.svg?no-inline";
import cohereIcon from "@lobehub/icons-static-svg/icons/cohere.svg?no-inline";
import deepSeekIcon from "@lobehub/icons-static-svg/icons/deepseek.svg?no-inline";
import googleIcon from "@lobehub/icons-static-svg/icons/google.svg?no-inline";
import ibmIcon from "@lobehub/icons-static-svg/icons/ibm.svg?no-inline";
import metaIcon from "@lobehub/icons-static-svg/icons/meta.svg?no-inline";
import minimaxIcon from "@lobehub/icons-static-svg/icons/minimax.svg?no-inline";
import mistralIcon from "@lobehub/icons-static-svg/icons/mistral.svg?no-inline";
import moonshotIcon from "@lobehub/icons-static-svg/icons/moonshot.svg?no-inline";
import nousResearchIcon from "@lobehub/icons-static-svg/icons/nousresearch.svg?no-inline";
import nvidiaIcon from "@lobehub/icons-static-svg/icons/nvidia.svg?no-inline";
import openAiIcon from "@lobehub/icons-static-svg/icons/openai.svg?no-inline";
import openRouterIcon from "@lobehub/icons-static-svg/icons/openrouter.svg?no-inline";
import perplexityIcon from "@lobehub/icons-static-svg/icons/perplexity.svg?no-inline";
import poolsideIcon from "@lobehub/icons-static-svg/icons/poolside.svg?no-inline";
import qwenIcon from "@lobehub/icons-static-svg/icons/qwen.svg?no-inline";
import tencentIcon from "@lobehub/icons-static-svg/icons/tencent.svg?no-inline";
import xAiIcon from "@lobehub/icons-static-svg/icons/xai.svg?no-inline";
import zAiIcon from "@lobehub/icons-static-svg/icons/zai.svg?no-inline";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

type Brand = Readonly<{
  iconUrl: string;
  name: string;
}>;

const brands: ReadonlyMap<string, Brand> = new Map([
  ["aion-labs", { iconUrl: aionLabsIcon, name: "Aion Labs" }],
  ["amazon", { iconUrl: awsIcon, name: "Amazon" }],
  ["anthropic", { iconUrl: anthropicIcon, name: "Anthropic" }],
  ["arcee", { iconUrl: arceeIcon, name: "Arcee AI" }],
  ["bytedance", { iconUrl: byteDanceIcon, name: "ByteDance" }],
  ["cohere", { iconUrl: cohereIcon, name: "Cohere" }],
  ["deepseek", { iconUrl: deepSeekIcon, name: "DeepSeek" }],
  ["google", { iconUrl: googleIcon, name: "Google" }],
  ["ibm", { iconUrl: ibmIcon, name: "IBM" }],
  ["meta", { iconUrl: metaIcon, name: "Meta" }],
  ["minimax", { iconUrl: minimaxIcon, name: "MiniMax" }],
  ["mistral", { iconUrl: mistralIcon, name: "Mistral AI" }],
  ["moonshot", { iconUrl: moonshotIcon, name: "Moonshot AI" }],
  ["nousresearch", { iconUrl: nousResearchIcon, name: "Nous Research" }],
  ["nvidia", { iconUrl: nvidiaIcon, name: "NVIDIA" }],
  ["openai", { iconUrl: openAiIcon, name: "OpenAI" }],
  ["openrouter", { iconUrl: openRouterIcon, name: "OpenRouter" }],
  ["perplexity", { iconUrl: perplexityIcon, name: "Perplexity" }],
  ["poolside", { iconUrl: poolsideIcon, name: "Poolside" }],
  ["qwen", { iconUrl: qwenIcon, name: "Qwen" }],
  ["tencent", { iconUrl: tencentIcon, name: "Tencent" }],
  ["x-ai", { iconUrl: xAiIcon, name: "xAI" }],
  ["z-ai", { iconUrl: zAiIcon, name: "Z.ai" }],
]);

export function getBrandName(brandId: string) {
  const brand = brands.get(brandId);

  if (brand) {
    return brand.name;
  }

  const name = brandId
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return name || brandId;
}

type BrandMarkProps = {
  brandId: string;
  fallbackIcon: IconSvgElement;
  style?: StyleXStyles;
};

export function BrandMark({ brandId, fallbackIcon, style }: BrandMarkProps) {
  const iconUrl = brands.get(brandId)?.iconUrl;
  const styleProps = stylex.props(styles.mark, style);

  if (!iconUrl) {
    return (
      <HugeiconsIcon
        icon={fallbackIcon}
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        {...styleProps}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={styleProps.className}
      style={{ ...styleProps.style, mask: `url("${iconUrl}") center / contain no-repeat` }}
    />
  );
}

const styles = stylex.create({
  mark: {
    backgroundColor: "currentColor",
    display: "inline-block",
    flexShrink: 0,
    height: "1rem",
    width: "1rem",
  },
});
