package content

import (
	"context"

	"github.com/riverqueue/river"

	"content-api-connect-rpc/pkg/outbox"
)

type IndexArgs struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

func (IndexArgs) Kind() string { return "content.index" }

func NewIndexArgs(event outbox.Event) *IndexArgs {
	return &IndexArgs{ID: event.ID, Type: event.Type}
}

type IndexWorker struct {
	river.WorkerDefaults[IndexArgs]
}

func (w *IndexWorker) Work(ctx context.Context, job *river.Job[IndexArgs]) error {
	// TODO: index/update/delete content in OpenSearch based on job.Args.Type
	return nil
}
