package main

import (
	"github.com/google/uuid"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
	contentdomain "content-api-connect-rpc/internal/domain/content"
	internaloutbox "content-api-connect-rpc/internal/outbox"
	"content-api-connect-rpc/pkg/cache"
)

type Domains struct {
	Content contentdomain.Service
}

func setupDomains(conn *Connections) *Domains {
	queries := sqlccontent.New(conn.Pool)
	contentCache := cache.NewInMemory[uuid.UUID, *sqlccontent.Content]()
	contentOutbox := internaloutbox.NewRiverOutbox(conn.RiverClient)

	contentService := contentdomain.New(contentdomain.Dependencies{
		Pool:    conn.Pool,
		Queries: queries,
		Cache:   contentCache,
		Outbox:  contentOutbox,
	})

	return &Domains{Content: contentService}
}
