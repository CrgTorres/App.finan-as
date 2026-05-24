"use client";

import type { ConsigfacilAjusteBase } from "@/types/consigfacil";
import {
  DivergenciasContextuaisPainel,
  type DivergenciasContextuaisPainelProps,
} from "@/components/conciliacao/divergencias-contextuais-painel";

export type ConsigfacilAjustesPainelProps = DivergenciasContextuaisPainelProps;

/** Painel de ajustes com consolidação contextual de divergências repetidas. */
export function ConsigfacilAjustesPainel(props: ConsigfacilAjustesPainelProps) {
  return <DivergenciasContextuaisPainel {...props} />;
}
