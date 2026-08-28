import AiNetworkIcon from "@hugeicons/core-free-icons/AiNetworkIcon";
import type { StyleXStyles } from "@stylexjs/stylex";
import { BrandMark } from "@/feature/brand/catalog";

type ProviderMarkProps = {
  brandId: string;
  style?: StyleXStyles;
};

export function ProviderMark({ brandId, style }: ProviderMarkProps) {
  return <BrandMark brandId={brandId} fallbackIcon={AiNetworkIcon} style={style} />;
}
