import AiNetworkIcon from "@hugeicons/core-free-icons/AiNetworkIcon";
import { BrandMark } from "@/feature/brand/catalog";

type ProviderMarkProps = {
  brandId: string;
  className?: string;
};

export function ProviderMark({ brandId, className }: ProviderMarkProps) {
  return <BrandMark brandId={brandId} fallbackIcon={AiNetworkIcon} className={className} />;
}
