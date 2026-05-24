"use client";

import { FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ExportacaoBotoes({
  disabled,
  onExport,
}: {
  disabled?: boolean;
  onExport: (tipo: "xlsx" | "csv" | "json") => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Baixar pacote</CardTitle>
        <CardDescription>
          Excel multi-abas, CSV da Base_Normalizada e JSON técnico versionado para integrações futuras.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" className="gap-2" disabled={disabled} onClick={() => onExport("xlsx")}>
          <FileSpreadsheet className="h-4 w-4" />
          Baixar Excel completo
        </Button>
        <Button type="button" variant="outline" className="gap-2" disabled={disabled} onClick={() => onExport("csv")}>
          <FileText className="h-4 w-4" />
          Baixar CSV base normalizada
        </Button>
        <Button type="button" variant="outline" className="gap-2" disabled={disabled} onClick={() => onExport("json")}>
          <FileJson className="h-4 w-4" />
          Baixar JSON técnico
        </Button>
      </CardContent>
    </Card>
  );
}

