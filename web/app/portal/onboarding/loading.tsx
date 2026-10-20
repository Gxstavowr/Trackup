import { PageSkeleton } from "@/components/ui/skeleton";

/** Questionário inicial / protocolo em preparação: esqueleto até a página resolver. */
export default function OnboardingLoading() {
  return <PageSkeleton label="Carregando seu questionário…" cards={3} />;
}
