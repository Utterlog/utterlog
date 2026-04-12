package gateway

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Meta struct {
	Source         string `json:"source,omitempty"`
	Site           string `json:"site,omitempty"`
	ConnectionMode string `json:"connection_mode,omitempty"`
	TrafficMode    string `json:"traffic_mode,omitempty"`
	CloudRegion    string `json:"cloud_region,omitempty"`
}

type ChatRequest struct {
	Provider      string    `json:"provider"`
	Model         string    `json:"model"`
	Messages      []Message `json:"messages"`
	ProviderToken string    `json:"-"`
	Temperature   *float64  `json:"temperature,omitempty"`
	MaxTokens     *int      `json:"max_tokens,omitempty"`
	Stream        bool      `json:"stream"`
	Cache         bool      `json:"cache,omitempty"`
	Meta          Meta      `json:"meta,omitempty"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens,omitempty"`
	CompletionTokens int `json:"completion_tokens,omitempty"`
	TotalTokens      int `json:"total_tokens,omitempty"`
}

type ChatResponse struct {
	ID       string         `json:"id,omitempty"`
	Provider string         `json:"provider"`
	Model    string         `json:"model"`
	Content  string         `json:"content,omitempty"`
	Raw      map[string]any `json:"raw,omitempty"`
	Usage    Usage          `json:"usage,omitempty"`
}
