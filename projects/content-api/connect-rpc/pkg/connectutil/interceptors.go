package connectutil

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/rs/zerolog/log"
)

func NewInterceptors() []connect.Interceptor {
	validateInterceptor, _ := validate.NewInterceptor()
	return []connect.Interceptor{
		NewRecoveryInterceptor(),
		NewLoggingInterceptor(),
		validateInterceptor,
	}
}

func NewRecoveryInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
			defer func() {
				if r := recover(); r != nil {
					err = connect.NewError(connect.CodeInternal, fmt.Errorf("panic: %v", r))
				}
			}()
			return next(ctx, req)
		}
	}
}

func NewLoggingInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()
			resp, err := next(ctx, req)
			evt := log.Info()
			if err != nil {
				evt = log.Error().Err(err)
			}
			evt.
				Str("procedure", req.Spec().Procedure).
				Dur("duration", time.Since(start)).
				Msg("rpc")
			return resp, err
		}
	}
}
