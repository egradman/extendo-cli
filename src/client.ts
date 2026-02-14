export interface ProtocolEndpoint {
  category: string;
  name: string;
  displayName?: string;
  lastActivity?: string;
  preview?: string;
}

export interface ProtocolMessage {
  author: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}

export interface ProtocolUpdate {
  category: string;
  name: string;
  latestTimestamp: string;
  preview: string;
}

export interface EndpointsResponse {
  backendId: string;
  capabilities: Record<string, boolean>;
  endpoints: ProtocolEndpoint[];
}

export interface MessagesResponse {
  messages: ProtocolMessage[];
}

export interface PostResponse {
  ok: boolean;
  message: string;
  endpoint: { category: string; name: string };
}

export interface PollResponse {
  updates: ProtocolUpdate[];
  serverTime: string;
}

export interface Artifact {
  id: string;
  type: string;
  status: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  conversationLink?: { category: string; name: string };
  completion: string | { field: string; condition: string };
  payload: Record<string, any>;
}

export class SetaeClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SetaeClientError";
  }
}

export class SetaeClient {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new SetaeClientError(
        (body as { error?: string }).error ?? `HTTP ${res.status}`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  }

  async listEndpoints(): Promise<EndpointsResponse> {
    return this.request<EndpointsResponse>("/endpoints");
  }

  async readMessages(
    category: string,
    name: string,
  ): Promise<MessagesResponse> {
    return this.request<MessagesResponse>(
      `/endpoints/${encodeURIComponent(category)}/${encodeURIComponent(name)}/messages`,
    );
  }

  async postMessage(
    category: string,
    name: string,
    text: string,
  ): Promise<PostResponse> {
    return this.request<PostResponse>(
      `/endpoints/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify({ text }) },
    );
  }

  async poll(since: string): Promise<PollResponse> {
    return this.request<PollResponse>(
      `/poll?since=${encodeURIComponent(since)}`,
    );
  }

  async listArtifacts(status?: string): Promise<{ artifacts: Artifact[] }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<{ artifacts: Artifact[] }>(`/artifacts${query}`);
  }

  async getArtifact(category: string, name: string): Promise<Artifact> {
    return this.request<Artifact>(
      `/artifacts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
    );
  }

  async putArtifact(category: string, name: string, artifact: any): Promise<Artifact> {
    return this.request<Artifact>(
      `/artifacts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      { method: "PUT", body: JSON.stringify(artifact) },
    );
  }

  async deleteArtifact(category: string, name: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(
      `/artifacts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
  }
}
