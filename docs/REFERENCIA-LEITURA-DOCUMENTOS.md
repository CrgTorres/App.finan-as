# Referência interna — leitura de documentos (OCR, PDF e organização)

Este documento é a **fonte única de verdade** para quem for evoluir extração, classificação (receita/despesa), impostos, empréstimos e reconhecimento de instituições financeiras no FinançaHub. Ele descreve o **estado atual do código**, as **lacunas** e uma **tabela de bancos/siglas** para alinhar parsers, heurísticas e testes.

---

## 1. Objetivo do produto neste ponto

O “carro chefe” é **ler documentos com clareza** e transformar isso em dados utilizáveis (transações, contracheque/ficha financeira, nota fiscal). Hoje o app combina:

- **Texto nativo em PDF** (pdf.js) quando existe camada de texto.
- **OCR** (Tesseract, português + inglês) para imagens e para PDF **sem** texto selecionável (escaneado).
- **Parsers heurísticos** (regex + palavras-chave), não IA generativa treinada em layout específico de cada banco.

Ou seja: **leitura perfeita em 100% dos layouts do mercado não é garantida** sem revisão humana ou modelos treinados por layout. Este documento serve para **reduzir ambiguidade** e priorizar o que implementar depois (siglas, bancos, rubricas).

---

## 2. Onde cada tipo de arquivo entra no app

| Área do app | Formatos aceitos | O que é extraído hoje |
|-------------|------------------|----------------------|
| **Nota fiscal** (`/dashboard/nota-fiscal`) | JPG, PNG, WEBP, GIF, BMP, PDF, XML (NF-e) | Uma transação sugerida: descrição, valor total, data, CNPJ (quando aparece), categoria por palavra-chave no nome do estabelecimento. |
| **Anexos da folha** (`/dashboard/contracheque`) | PDF, imagem, TXT | **Contracheque mensal** (um mês por PDF): um único fluxo de revisão com competência confirmável. **Ficha financeira / ficha corrida** (várias competências num ficheiro SEAD, ex. `JANEIRO/2012` … ou vários `DATA MM/AAAA`): `readContrachequeFichaDocumentText` + `parseFichaFinanceiraMeses` — uma linha por mês na UI; gravação confirmada **por linha**. A deteção de ficha corrida inclui título com espaços entre letras (`F I C H A … F I N A N C E I R A`), linha `PERIODO JAN/AAAA A DEZ/AAAA` e contagem de marcadores no texto completo (não só os primeiros 50 kB). |
| **Importar** (`/dashboard/import`) | CSV, TXT, PDF (texto), OFX/QIF (se implementado no fluxo) | Linhas de extrato para pré-visualização e gravação; categoria por `categorizer`. |

Arquivos **HEIC** podem falhar no OCR do navegador se não forem convertidos para JPEG/PNG antes.

---

## 3. Limitações técnicas importantes (para não frustrar expectativa)

1. **OCR** depende de qualidade da foto/PDF escaneado (DPI, foco, sombra). Linhas fracas ou colunas desalinhadas geram texto “quebrado” e o regex não casa.
2. **Um PDF de extrato com layout em colunas** pode extrair texto na ordem errada (pdf.js concatena por posição Y; ainda assim colunas estreitas se misturam).
3. **Nota fiscal (imagem/PDF)** usa `parseInvoiceText`: busca **valor total**, **data**, **CNPJ**, **nome** por padrões fixos. Não lê item a item, ICMS detalhado, nem parcelas.
4. **Contracheque / ficha** — parsers SEAD em `src/lib/anexos/sead-payslip-parse.ts` e `sead-ficha-parse.ts`. A função `deveUsarFluxoFichaFinanceira` decide se o mesmo PDF deve ser segmentado em várias competências; **nunca** interpretar ficha corrida como um único `parseSeadPayslipText` sobre o ficheiro inteiro (isso soma totais de todos os meses).
5. **Diferenciação fina** em rubricas continua por palavras‑chave e deteção de instituição (`instituicoes-financeiras`).

---

## 4. Como o código classifica hoje (resumo)

### 4.1 Vantagem vs desconto (contracheque / ficha financeira)

Implementado em `sead-payslip-parse.ts` (listas de hints + `detectarInstituicaoNaDescricao` para consignados/bancos).

### 4.2 Categoria de despesa/receita na nota fiscal e import

Arquivo: `src/lib/import/categorizer.ts`

- Mapa de **palavras-chave → categoria** (Alimentação, Transporte, Moradia, etc.).
- **Salário** e **Freelance** têm chaves que ajudam a separar “folha / contracheque / PIX recebido” de consumo.

Para “absorver todas as linhas” de um extrato com **imposto** vs **empréstimo** explícitos, o próximo passo de produto é: **parser de extrato por banco** ou **camada de regras** usando as siglas abaixo — este documento alimenta essa lista.

---

## 5. Impostos e encargos — nomes e siglas frequentes (Brasil)

Use esta lista para **expandir** `DESCONTO_HINTS` / regex e para testes de OCR (acentos podem sumir).

| Tema | Como aparece (exemplos) | Observação |
|------|-------------------------|------------|
| Previdência | `INSS`, `PREVID`, `PREVIDÊNCIA`, `RPPS`, `REGIME PRÓPRIO` | Confundir com “prev” de outras palavras: preferir match de palavra inteira quando possível. |
| IR fonte | `IRRF`, `IR RENDA`, `IRRF SALARIO`, `I.R.R.F.` | Contracheque quase sempre “IRRF”. |
| IR declaração | `IRPF`, `IMPOSTO RENDA` | Menos comum em folha mensal. |
| FGTS | `FGTS`, `RECOLHIMENTO FGTS` | Às vezes só em rescisão/resumo. |
| PIS/COFINS/CSLL | `PIS`, `COFINS`, `CSLL`, `CONTRIB` | Mais comum em nota fiscal de serviço / PJ. |
| ISS | `ISS`, `ISSQN` | Serviços / NFS-e. |
| Sindicato | `SIND`, `SINDICATO`, `CONTRIB ASSOC` | Desconto. |
| Pensão judicial | `PENSAO`, `PENSÃO ALIMENT`, `ALIMENT` | Desconto. |
| Plano de saúde | `PLANO SAUDE`, `UNIMED`, `AMIL`, `BRADESCO SAUDE`, `MENSALID PLANO` | Muitas variações de grafia. |

---

## 6. Empréstimos e crédito consignado — padrões de texto

| Conceito | Padrões úteis para busca / OCR |
|----------|--------------------------------|
| Empréstimo genérico | `EMPREST`, `EMPRÉST`, `FINANC`, `CREDITO PESSOAL` |
| Consignado | `CONSIG`, `CONSIGN`, `MARGEM`, `CARTAO CONSIG` (cuidado: cartão) |
| CDC / financiamento | `CDC`, `PARCELA`, `PRESTAC`, `PRESTAÇ` |
| Desconto folha | `DESCONTO FOLHA`, `DESC FOLHA`, `RUBRICA` + nome do banco |
| Refin / port | `REFIN`, `PORTABIL`, `RENEGO` |

Combinações como **`EMP CONSIG BB`** ou **`CONSIG ITAU`** aparecem compactadas: a tabela de bancos (próxima seção) é essencial.

---

## 7. Instituições financeiras — códigos COMPE (Bacen) e siglas para leitura

Código **COMPE** de três dígitos (ex.: `001`) costuma aparecer em TED/DOC, boletos e em muitos contracheques. **Sigla** é como o cliente vê no extrato. **Aliases OCR** são erros comuns de leitura (sem acento, “I” por “l”, etc.).

> Lista enxuta dos bancos mais frequentes em extratos e folhas; instituições menores seguem o [arranjo de compensação do Bacen](https://www.bcb.gov.br/estabilidadefinanceira/compe) (atualizar periodicamente).

| COMPE | Nome reduzido (referência) | Siglas / marcas em extrato | Aliases úteis para OCR / regex |
|------:|----------------------------|----------------------------|--------------------------------|
| 001 | Banco do Brasil | `BB`, `BCO BRASIL`, `B.DO BRASIL` | `BANCO DO BRASIL`, `BRASIL` (cuidado: genérico) |
| 003 | Banco da Amazônia | `BASA`, `AMAZONIA` | `AMAZÔNIA` |
| 004 | Banco do Nordeste | `BNB`, `NORDESTE` | `BCO NORDESTE` |
| 007 | BNDES | `BNDES` | — |
| 021 | Banestes | `BANESTES` | — |
| 033 | Santander | `SANTANDER`, `ABN`, `REAL` (legado) | `STD`, `SANTANDR` |
| 037 | Banpará | `BANPARA`, `PARA` | — |
| 041 | Banrisul | `BANRISUL`, `RS` | — |
| 047 | Banco do Estado de SE | `BANESE` | — |
| 062 | Hipercard | `HIPERCARD` | — |
| 070 | BRB — Banco de Brasília | `BRB` | — |
| 077 | Banco Inter | `INTER`, `BANCO INTER` | `1NTER` (OCR) |
| 084 | Uniprime | `UNIPRIME` | — |
| 099 | Uniprime Central | `UNIPRIME` | — |
| 102 | XP Investimentos | `XP`, `XP INVEST` | — |
| 104 | Caixa Econômica Federal | `CEF`, `CAIXA`, `CX` | `CA1XA`, `CEF` |
| 133 | Cresol | `CRESOL` | — |
| 136 | Confederação Unicred | `UNICRED` | — |
| 197 | Stone | `STONE` | `ST0NE` |
| 208 | BTG Pactual | `BTG`, `BTG PACTUAL` | `BTG P` |
| 212 | Banco Original | `ORIGINAL` | `0RIGINAL` |
| 218 | Banco BS2 | `BS2` | `852` (OCR confunde B/8) |
| 237 | Bradesco | `BRADESCO`, `NEXT` (marca) | `BRADESC0`, `BRAD` |
| 260 | Nu Pagamentos (Nubank) | `NUBANK`, `NU PAGAMENTOS` | `NU PAG`, `NUBNK` |
| 290 | PagSeguro | `PAGSEGURO`, `PAG BANK` | — |
| 323 | Mercado Pago | `MERCADO PAGO`, `MP` | — |
| 318 | Banco BMG | `BMG` | — |
| 336 | Banco C6 | `C6`, `C6 BANK` | `C6BANK` |
| 341 | Itaú Unibanco | `ITAU`, `ITAÚ`, `UNIBANCO` | `1TAU`, `ITAU UNIBANCO` |
| 389 | Banco Mercantil | `MERCANTIL` | — |
| 422 | Banco Safra | `SAFRA` | `5AFRA` |
| 633 | Banco Rendimento | `RENDIMENTO` | — |
| 637 | Banco Sofisa | `SOFISA` | — |
| 643 | Banco Pine | `PINE` | — |
| 655 | Banco Votorantim | `BV`, `VOTORANTIM` | `BV FIN` |
| 707 | Banco Daycoval | `DAYCOVAL` | — |
| 712 | Banco Ourinvest | `OURINVEST` | — |
| 741 | Banco Ribeirão Preto | `BRP` | — |
| 745 | Citibank | `CITI`, `CITIBANK` | — |
| 746 | Banco Modal | `MODAL` | — |
| 748 | Sicredi | `SICREDI` | `S1CREDI` |
| 751 | Scotiabank | `SCOTIA` | — |
| 756 | Sicoob | `SICOOB`, `BANCOOB` | `S1COOB` |
| 748 / cooperativas | Credisis, etc. | `CREDISIS` | ver site Sicredi/cred |

**Cartões e adquirentes** (não são “banco” COMPE mas aparecem muito):

| Marca | Palavras-chave |
|-------|----------------|
| Visa | `VISA` |
| Mastercard | `MASTER`, `MASTERCARD` |
| Elo | `ELO` |
| Amex | `AMEX`, `AMERICAN EXPRESS` |
| Hipercard | `HIPER` |
| GetNet | `GETNET` |
| Cielo | `CIELO` |
| Rede | `REDE`, `ITAU REDE` |
| Stone | `STONE` |
| PagBank / Moderninha | `PAGSEGURO`, `PAGBANK` |

---

## 8. Receita vs despesa em linguagem de extrato

Heurísticas úteis para futuros parsers (não todas estão no app ainda):

| Indicador de **entrada** | Indicador de **saída** |
|--------------------------|------------------------|
| `CREDITO`, `CR`, `TED C`, `PIX RECEBIDO`, `DEPOSITO`, `TRANSF RECEBIDA`, `SALARIO`, `REMUNER` | `DEBITO`, `DB`, `PIX ENVIADO`, `PAGAMENTO`, `COMPRA`, `BOLETO`, `SAQUE` |
| Valor positivo em coluna “crédito” | Valor em “débito” |

Bancos misturam PT/EN; incluir ambos nos testes.

---

## 9. Checklist para melhorar a “leitura perfeita” (evolução)

1. **Dicionário único** — mover bancos/siglas deste doc para constante TS (`src/lib/reading/instituicoes.ts`) e importar nos parsers (evita divergência doc vs código).
2. **Testes com PDFs reais anonimizados** — um fixture por banco (Caixa, BB, Nubank, Itaú) para regressão de texto pdf.js.
3. **Pós-processamento OCR** — normalizar `0/O`, `1/l`, remover ruído de cabeçalho repetido.
4. **Classificador em duas etapas** — (a) detectar instituição; (b) aplicar regras de rubrica (imposto vs empréstimo).
5. **UI de correção** — já existe revisão na nota fiscal; estender padrão “editar antes de salvar” para import em massa.

---

## 10. Arquivos de código relacionados

| Função | Arquivo |
|--------|---------|
| Dicionário COMPE + siglas + detecção em texto | `src/lib/reading/instituicoes-financeiras.ts` |
| OCR imagem + PDF escaneado (nota fiscal) | `src/lib/nota-fiscal/ocr.ts` |
| Parser NF-e XML e texto | `src/lib/nota-fiscal/parser.ts` |
| PDF texto (import extrato) + worker pdf.js | `src/lib/reading/contracheque-ficha-document-text.ts` (`extractPdfTextLayerGrouped`), `src/lib/import/pdf-parser.ts` |
| Anexos SEAD (parse + competência + Salário) | `src/lib/anexos/sead-payslip-parse.ts`, `sead-ficha-parse.ts`, `competencia.ts`, `sync-salary-from-payslip.ts` |
| Categorias por palavra-chave | `src/lib/import/categorizer.ts` |
| Import PDF/CSV | `src/lib/import/pdf-parser.ts`, `csv-parser.ts` |

---

**Manutenção:** ao adicionar banco ou sigla, atualize **este arquivo** e, na mesma tarefa, os **hints/regex** correspondentes no código para não haver documentação “bonita” mas app desatualizado.
