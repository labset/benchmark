package content

import (
	"context"

	"github.com/riverqueue/river"

	"content-api-connect-rpc/pkg/outbox"
)

type AuditArgs struct {
	ID     string `json:"id"`
	Action string `json:"action"`
}

func (AuditArgs) Kind() string { return "content.audit" }

func NewAuditArgs(event outbox.Event) *AuditArgs {
	return &AuditArgs{ID: event.ID, Action: event.Type}
}

type AuditWorker struct {
	river.WorkerDefaults[AuditArgs]
}

func (w *AuditWorker) Work(ctx context.Context, job *river.Job[AuditArgs]) error {
	// TODO: write audit trail
	return nil
}
