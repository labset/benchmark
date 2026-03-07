package content

import (
	"context"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"

	contentv1 "content-api-connect-rpc/gen/proto/content/v1"
	"content-api-connect-rpc/pkg/connectutil"
)

func (h *handler) DeleteContent(
	ctx context.Context,
	req *connect.Request[contentv1.DeleteContentRequest],
) (*connect.Response[contentv1.DeleteContentResponse], error) {
	id, err := uuid.FromString(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	if err := h.service.Delete(ctx, id); err != nil {
		return nil, connectutil.NewErrorFrom(err, errorMappings)
	}
	return connect.NewResponse(&contentv1.DeleteContentResponse{
		Success: true,
	}), nil
}
