# Backups do projeto (Finança Pessoal)

Snapshots locais no Git — **não alteram** o código em uso até você aplicar ou trocar de branch.

| # | Nome | Stash | Branch | Data (referência) | Conteúdo resumido |
|---|------|-------|--------|-------------------|-------------------|
| 1 | Etapa 1 concluída | `stash@{1}` → `etapa 1 concluida` | `backup/etapa-1-concluida` | 2026-05-06 | Primeiro marco salvo |
| 2 | **Engrenagem OK** | `stash@{0}` → `engrenagem-ok-2026-05-23` | `backup/engrenagem-ok` | 2026-05-23 | Navegação Fase 1, margem, consignações, conciliação, hubs Importar/Perfil |

**GitHub (`main`):** commit `4a8efd4` · tag [`engrenagem-ok`](https://github.com/CrgTorres/App.finan-as/releases/tag/engrenagem-ok)

> O índice do stash (`stash@{N}`) pode mudar se você criar outros stashes. Use `git stash list` e o nome entre aspas.

## Restaurar o backup **Engrenagem OK**

Na pasta `financa-pessoal`:

```powershell
cd "c:\Users\rodri\OneDrive\Desktop\Teste Code Hub\financa-pessoal"
git stash list
git stash apply "stash^{/engrenagem-ok-2026-05-23}"
```

Ou pelo branch (cria working tree a partir do snapshot; faça em branch temporária se quiser comparar):

```powershell
git checkout -b revisar-engrenagem-ok backup/engrenagem-ok
```

Para voltar ao trabalho atual depois: `git checkout main`.

## Restaurar o backup 1 (Etapa 1)

```powershell
git stash apply "stash^{/etapa 1 concluida}"
# ou
git checkout backup/etapa-1-concluida
```

## Criar um novo backup (padrão)

```powershell
git add -A
$snap = git stash create "nome do backup"
git stash store -m "nome-slug-AAAA-MM-DD" $snap
git branch -f backup/nome-slug $snap
git reset
```

O projeto continua igual na pasta; só fica guardado no stash e no branch `backup/*`.
