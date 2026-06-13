graph TD
    subgraph "Nivel Cliente"
        A[WhatsApp/Insta Msg] -->|Input| B(Webhook Endpoint)
    end

    subgraph "Nivel VSPRO API"
        B --> C{Tenant Middleware}
        C -->|Valida Schema| D[Process Message Worker]
        D --> E[AiEngine / GPT-4o]
        E --> F[(PostgreSQL Tenant Schema)]
    end

    subgraph "Nivel Admin/Pyme"
        F --> G[Panel Web Dashboard]
        G -->|Acción Manual| F
    end

    style C fill:#f96,stroke:#333,stroke-width:2px
    style E fill:#69f,stroke:#333,stroke-width:2px
    