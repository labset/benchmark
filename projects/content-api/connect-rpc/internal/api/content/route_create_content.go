package content

import (
	"context"

	"connectrpc.com/connect"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	"content-api-connect-rpc/pkg/connectutil"
)

func (h *handler) CreateContent(
	ctx context.Context,
	req *connect.Request[contentv1.CreateContentRequest],
) (*connect.Response[contentv1.CreateContentResponse], error) {
	result, err := h.service.Create(ctx, fromProtoCreate(req.Msg))
	if err != nil {
		return nil, connectutil.NewErrorFrom(err, errorMappings)
	}
	return connect.NewResponse(&contentv1.CreateContentResponse{
		Content: toProto(result),
	}), nil
}
