# 📦 CoreWMS (Warehouse Management System)

> Um sistema de gestão de armazéns moderno, reativo e distribuído, construído com foco em alta performance, rastreabilidade em tempo real e arquitetura multi-tenant.

O **CoreWMS** não é apenas um CRUD. Ele é uma plataforma arquitetada para resolver os desafios reais do chão de fábrica e da expedição, unindo um backend robusto em **.NET**, um frontend reativo em **React** e um agente local descentralizado para comunicação direta com hardware de impressão.

---

## 🏗️ Arquitetura e Stack Tecnológico

O ecossistema é dividido em três camadas principais, cada uma com responsabilidades estritas e tecnologias específicas:

### 1. ⚙️ Backend (CoreWMS.Api)
API RESTful construída em **.NET 10**, utilizando princípios de Clean Architecture, Domain-Driven Design (DDD) e CQRS.
*   **CQRS & Mediator:** Padrão implementado com `MediatR`. Separação clara entre *Commands* (escrita/mudança de estado) e *Queries* (leitura).
*   **Validação:** `FluentValidation` injetado diretamente no pipeline do MediatR. Requisições inválidas geram erro 400 antes mesmo de tocarem nos Handlers.
*   **Dados Relacionais:** `Entity Framework Core` com suporte a Multi-Tenancy nativo (Filtros Globais por Empresa/Tenant).
*   **Dados Não-Relacionais (Auditoria):** `MongoDB` para gravação assíncrona de logs de auditoria em formato de *Snapshot* (imutabilidade temporal).
*   **Comunicação em Tempo Real:** `SignalR` para rastreamento de conexões ativas e envio instantâneo de comandos (ex: WebSockets para impressão).
*   **Tratamento Global de Erros:** Exceções de domínio e bibliotecas interceptadas nativamente pelo `GlobalExceptionHandler`, mantendo os Handlers livres de blocos `try/catch`.
*   **Segurança:** Autenticação via JWT (com Refresh Tokens) e Autorização baseada em Permissões (Custom Filters).

### 2. 🖥️ Frontend (corewms-web)
Single Page Application (SPA) ultrarrápida desenvolvida com **React** e **Vite**.
*   **Design System:** `Tailwind CSS` aliado aos componentes acessíveis e modulares do `shadcn/ui`.
*   **Gerenciamento de Estado de Formulários:** `React Hook Form` combinado com `Zod` para validações declarativas espelhadas no backend.
*   **Sincronização de API (The Magic):** `Orval` para geração automática de Hooks do `TanStack React Query` e tipagens TypeScript diretamente do Swagger da API.
*   **Estado Global:** `Zustand` para controle de sessão (Auth) e seleção de Empresa (Multi-tenant).

### 3. 🖨️ Agente de Hardware (CoreWMS.PrintAgent)
Um Worker Service (Instalável via Windows Service ou Linux Systemd) que roda na rede local do cliente.
*   **Resiliência Offline:** Utiliza SQLite local (`print_queue.db`) para guardar na fila requisições de impressão caso a rede oscile.
*   **Protocolos de Impressão:** Comunicação direta RAW TCP Socket (Zebra/Epson), Spooler nativo do Windows (winspool) e CUPS do Linux.
*   **Conexão Global:** Mantém um túnel persistente via SignalR com a nuvem, aguardando comandos ZPL em tempo real e reportando status (Online/Offline/Sucesso/Erro).

---

## 🧩 Módulos Principais

### 🏢 Identity & Multi-Tenancy
*   Gestão de Usuários e Perfis (Roles).
*   Controle Granular de Permissões (Cache em memória para alta performance).
*   O sistema é 100% *Multi-Tenant*. Um usuário pode pertencer a várias empresas e alternar entre elas, o que altera o contexto global da API de forma transparente.

### 🖨️ Gestão de Impressão Global
*   **Agentes Globais:** Cadastro das máquinas físicas (PCs) que rodam o Worker Service. O status (Online/Offline) é monitorado em tempo real pelo SignalR Connection Manager.
*   **Impressoras:** Mapeamento de impressoras (IP:Porta, LPT, USB) atreladas a um Agente.
*   **Templates ZPL:** Cadastro de layouts (etiquetas) diretamente no sistema. Disparo de impressões de teste via painel administrativo que chegam em milissegundos no chão de fábrica.

### 🧾 Fiscal & SEFAZ
*   Processamento e validação de esquemas XML (XSD) nativos da SEFAZ para NFe e CTe.
*   Consultas de status e cadastros sincronizados.

### 👁️‍🗨️ Auditoria Baseada em Snapshot
*   Logs interceptados via `IHostedService` (Background Worker) para não penalizar o tempo de resposta das requisições HTTP.
*   Os registros salvam o *nome* das entidades e usuários no exato momento da ação, garantindo que o histórico permaneça legível mesmo se as entidades originais forem apagadas do banco de dados relacional (Proteção contra exclusão em cascata de logs).

---

## 📖 Guias e Padrões de Desenvolvimento (Guidelines)

Para manter a base de código escalável e limpa, a equipe deve seguir estes preceitos inegociáveis:

1.  **Geração de API Front-end (Orval):**
    Nunca crie requisições Axios/Fetch manualmente. Sempre que o Backend sofrer alterações (novos endpoints ou mudanças de DTOs), compile a API e rode o gerador no frontend:
    ```bash
    npm run generate:api
    ```
2.  **Encapsulamento de Entidades (DDD):**
    As entidades do CoreWMS (ex: `Printer.cs`, `Company.cs`) possuem `private set;` em suas propriedades. Atualizações de estado **devem** ser feitas através de métodos de domínio (ex: `Update(...)`, `RegenerateApiKey(...)`), nunca por atribuição direta nos Handlers.
3.  **Validações Duplas (Front + Back):**
    Toda regra de negócio ou obrigatoriedade de campo deve existir em dois lugares: no esquema do `Zod` (para UX imediata no frontend) e no `FluentValidation` (para proteção real do backend).
4.  **Uso de Permissões:**
    Todo novo endpoint REST no backend deve ser explicitamente mapeado com a exigência de permissão usando `[RequirePermission(Permissions.Modulo.Acao)]` ou mapeado fluentemente nas rotas do .NET Minimal API.

---

## 🚀 Como Executar o Projeto Localmente

### 1. Subindo a Infraestrutura
Na raiz do projeto, suba os serviços de dependência (PostgreSQL, MongoDB, Redis) através do Docker Compose:
```bash
docker-compose up -d --build

```

### 2. Rodando a API (Backend)

```bash
cd CoreWMS.Api
dotnet run

```

A API iniciará, aplicará as migrações (EF Core) e o Database Seeder criará os usuários e permissões padrões do sistema.

### 3. Rodando o Frontend

```bash
cd corewms-web
npm install
npm run dev

```

### 4. Rodando o Agente de Impressão (Opcional - para testes de hardware)

```bash
cd CoreWMS.PrintAgent
dotnet run

```

---

*CoreWMS - Construído com ❤️ e foco na excelência arquitetural.*

```

```