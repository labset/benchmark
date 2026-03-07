package content

import (
	"context"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	"content-api-connect-rpc/pkg/connectutil"
)

func (h *handler) GetContent(
	ctx context.Context,
	req *connect.Request[contentv1.GetContentRequest],
) (*connect.Response[contentv1.GetContentResponse], error) {
	id, err := uuid.FromString(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	result, err := h.service.Get(ctx, id)
	if err != nil {
		return nil, connectutil.NewErrorFrom(err, errorMappings)
	}
	return connect.NewResponse(&contentv1.GetContentResponse{
		Content: toProto(result),
	}), nil
}
