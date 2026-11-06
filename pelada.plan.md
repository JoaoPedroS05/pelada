# 📋 Plano de Funcionalidades: App de Pelada & Sorteio Automático (.plan)

## 📌 Visão Geral do Produto
Aplicativo mobile/web para automação da gestão de peladas de futebol. O sistema automatiza a arrecadação via PIX, realiza o sorteio equilibrado de times no horário limite e oferece avaliação técnica pós-jogo entre companheiros de equipe.

---

## ▶️ PONTO DE RETOMADA (leia primeiro)
- **Stack:** Node 22 + Express + better-sqlite3 (ESM). Testes: `npm test` (node:test). Rodar: `npm start`.
- **Estado:** Fase 1 backend concluída com gateway PIX **mock**. 8 testes passando.
- **Próximo passo:** (1) Integrar gateway PIX real (Asaas/Mercado Pago/Efí) implementando `createCharge` em `src/pix.js` e apontar o webhook deles para `POST /webhooks/pix`; (2) criar frontend (web/PWA ou React Native) consumindo a API; (3) iniciar Fase 2.
- **Decisões de design:** valores em centavos; datas em epoch ms (API recebe ISO 8601); nº de times = max(2, floor(jogadores/tamanho_time)); goleiros excedentes viram linha; só `CONFIRMADO` entra no sorteio; PIX pago após expirar e sem vaga => `REEMBOLSAR`; sorteio automático via `setInterval` de 30s em `src/server.js`.
- **Pendências conhecidas:** rate limit/CORS no Express; login Google/WhatsApp; fila de espera (hoje retorna 409 sem vagas); autenticação do webhook é por segredo compartilhado (trocar pela assinatura do gateway escolhido).

---

## 🎯 Escopo por Módulo

### 1. Módulo de Autenticação & Usuários
- [x] Cadastro/Login com e-mail e senha (scrypt + token HMAC) — `src/auth.js`
- [ ] Login com Google ou WhatsApp/Telefone.
- [x] Perfil do Jogador: nome, apelido, posição principal, posições secundárias, nota média e partidas jogadas.
- [ ] Edição de perfil (`PATCH /me`).

### 2. Módulo de Criação & Configuração de Peladas (Organizador)
- [x] Criação do evento: local, data/hora, horário limite, valor da cota, tamanho do time, nº de vagas, tipo de sorteio (`ALEATORIO` | `NIVEL_TECNICO`) — `POST /peladas`
- [x] Nível técnico pré-cadastrado pelo organizador — `PATCH /peladas/:id/jogadores/:userId/nivel`

### 3. Módulo de Inscrição & Pagamento Instantâneo
- [x] Detalhes da pelada e vagas restantes — `GET /peladas/:id`
- [x] Geração de PIX Copia e Cola (mock) — `POST /peladas/:id/inscricao`
- [x] Webhook de confirmação → `CONFIRMADO` — `POST /webhooks/pix`
- [x] Expiração do PIX pendente em 15 min liberando a vaga
- [ ] QR Code (imagem) do PIX
- [ ] Fila de espera com notificação ao próximo (Fase 3)

### 4. Módulo de Sorteio & Escalação Inteligente
- [x] Filtro automático: apenas `CONFIRMADO`
- [x] Snake draft: goleiros como cabeça de chave → ordenação por nota → serpenteamento — `src/draw.js`
- [x] Sorteio manual (organizador) e automático no horário limite
- [x] Texto formatado para WhatsApp — `GET /peladas/:id/times`
- [ ] Notificação push com a escalação
- [ ] Exportar escalação como imagem

### 5. Módulo de Avaliação Pós-Jogo (Fase 2)
- [ ] Janela de 24h após o fim da partida
- [ ] Elegibilidade: só quem jogou, e só avalia o mesmo `time_id`
- [ ] Interface de 1 a 5 estrelas
- [ ] Recálculo do rating por média móvel (últimas 5/10 partidas)

---

## 🚀 Fases de Implementação (Roadmap)

### Fase 1 — MVP Core (Sorteio + PIX)
- [x] Definição de requisitos e modelagem de dados.
- [x] Autenticação básica de usuários.
- [x] Backend de criação de peladas com parâmetros (`tamanho_time`, `tipo_sorteio`).
- [ ] Integração com gateway PIX real (hoje: `MockPix`).
- [x] Algoritmo de sorteio (Aleatório e por Nível pré-cadastrado pelo organizador).
- [ ] Frontend (web/PWA) da Fase 1.

### Fase 2 — Avaliação Pós-Jogo & Engajamento
- [ ] Tela de avaliação 1-5 estrelas pós-jogo.
- [ ] Validação de voto restrito ao mesmo `time_id`.
- [ ] Média móvel para recalcular o nível dos atletas.
- [x] Exportação da escalação em texto para o WhatsApp (adiantado da Fase 2).

### Fase 3 — Refinamento & Features Bônus
- [ ] Lista de espera e substituição automática.
- [ ] Histórico de estatísticas do jogador.
- [ ] Moderação de notas desproporcionais/abuso de avaliações.

---

## 🧾 Log de Commits
| Hash | Mensagem |
|------|----------|
| c0e9c87 | chore: scaffold do projeto (express + better-sqlite3, scripts, env) |
| 62758e6 | feat(db,auth): schema SQLite e autenticação (scrypt + token HMAC) |
| 0cefd4a | feat(draw): sorteio aleatório e snake draft por nível, com testes |
| 954b43e | fix(test): glob de testes compatível com Node 22 |
| 1ba3235 | feat(pix): contrato de gateway PIX + implementação mock |
| 2812c67 | feat(api): peladas, inscrição com PIX + expiração, webhook, sorteio e escalação WhatsApp |
| d5131c2 | test(api): fluxo e2e, expiração do PIX e sorteio automático |

## 🔌 Referência rápida da API
`POST /auth/register` · `POST /auth/login` · `GET /me` · `POST /peladas` · `GET /peladas/:id` · `POST /peladas/:id/inscricao` · `POST /webhooks/pix` (header `x-webhook-secret`) · `PATCH /peladas/:id/jogadores/:userId/nivel` · `POST /peladas/:id/sorteio` · `GET /peladas/:id/times`
