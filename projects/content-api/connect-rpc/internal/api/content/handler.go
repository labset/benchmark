package content

import (
	"connectrpc.com/connect"

	contentv1connect "content-api-connect-rpc/gen/proto/content/v1/contentv1connect"
	contentdomain "content-api-connect-rpc/internal/domain/content"
)

type Dependencies struct {
	Service contentdomain.Service
}

func New(deps Dependencies) contentv1connect.ContentServiceHandler {
	return &handler{service: deps.Service}
}

type handler struct {
	service contentdomain.Service
}

var errorMappings = map[error]connect.Code{
	contentdomain.ErrNotFound:      connect.CodeNotFound,
	contentdomain.ErrAlreadyExists: connect.CodeAlreadyExists,
}
