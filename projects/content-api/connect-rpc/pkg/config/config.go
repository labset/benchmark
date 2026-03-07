package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL   string
	OpenSearchURL string
	ServerAddr    string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	return &Config{
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://benchmark:benchmark@localhost:5432/benchmark?sslmode=disable"),
		OpenSearchURL: getEnv("OPENSEARCH_URL", "http://localhost:9200"),
		ServerAddr:    getEnv("SERVER_ADDR", ":8080"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
