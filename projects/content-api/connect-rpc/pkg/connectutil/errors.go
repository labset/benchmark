package connectutil

import (
	"errors"

	"connectrpc.com/connect"
)

func NewErrorFrom(err error, mappings map[error]connect.Code) *connect.Error {
	for sentinel, code := range mappings {
		if errors.Is(err, sentinel) {
			return connect.NewError(code, err)
		}
	}
	return connect.NewError(connect.CodeInternal, err)
}
