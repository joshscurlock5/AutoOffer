import { classifyBodyType, BODY_TYPE_LABEL, type BodyType } from "@/lib/bodyType";

/**
 * A professional side-profile car illustration matching the vehicle's body
 * type — a free, always-available stand-in for an exact-model photo on the
 * offer screen. Pass make/model and it classifies, or pass an explicit `type`.
 * Images are wide (≈2.2:1); size them by WIDTH (e.g. `w-24 h-auto`).
 */
const FILE: Record<BodyType, string> = {
  sedan: "body-sedan",
  suv: "body-suv",
  truck: "body-truck",
  van: "body-van",
  coupe: "body-coupe",
  hatch: "body-hatch",
};

export default function CarBodyIllustration({
  make,
  model,
  type,
  className = "",
}: {
  make?: string;
  model?: string;
  type?: BodyType;
  className?: string;
}) {
  const body: BodyType = type ?? classifyBodyType(make || "", model || "");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/${FILE[body]}.png`}
      alt={`${BODY_TYPE_LABEL[body]} illustration`}
      aria-hidden="true"
      className={className}
    />
  );
}
