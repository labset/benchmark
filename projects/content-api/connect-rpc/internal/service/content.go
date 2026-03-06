package service

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"

	contentv1 "content-api-connect-rpc/gen/content/v1"
)

type ContentServer struct {
	mu    sync.RWMutex
	store map[string]*contentv1.Content
}

func NewContentServer() *ContentServer {
	return &ContentServer{
		store: make(map[string]*contentv1.Content),
	}
}

func (s *ContentServer) CheckHealth(
	_ context.Context,
	_ *connect.Request[contentv1.HealthRequest],
) (*connect.Response[contentv1.HealthResponse], error) {
	return connect.NewResponse(&contentv1.HealthResponse{
		Status: "up",
	}), nil
}

func (s *ContentServer) ListContent(
	_ context.Context,
	req *connect.Request[contentv1.ListContentRequest],
) (*connect.Response[contentv1.ListContentResponse], error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	all := make([]*contentv1.Content, 0, len(s.store))
	for _, item := range s.store {
		all = append(all, proto.Clone(item).(*contentv1.Content))
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].CreatedAt < all[j].CreatedAt
	})

	total := int32(len(all))
	limit := req.Msg.Limit
	offset := req.Msg.Offset
	if limit <= 0 {
		limit = 10
	}
	start := int(offset)
	if start > len(all) {
		start = len(all)
	}
	end := start + int(limit)
	if end > len(all) {
		end = len(all)
	}

	return connect.NewResponse(&contentv1.ListContentResponse{
		Items:  all[start:end],
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}), nil
}

func (s *ContentServer) GetContent(
	_ context.Context,
	req *connect.Request[contentv1.GetContentRequest],
) (*connect.Response[contentv1.Content], error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, ok := s.store[req.Msg.Id]
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("content %s not found", req.Msg.Id))
	}
	return connect.NewResponse(proto.Clone(item).(*contentv1.Content)), nil
}

func (s *ContentServer) CreateContent(
	_ context.Context,
	req *connect.Request[contentv1.CreateContentRequest],
) (*connect.Response[contentv1.Content], error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	item := &contentv1.Content{
		Id:        uuid.New().String(),
		Title:     req.Msg.Title,
		Body:      req.Msg.Body,
		Status:    req.Msg.Status,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.store[item.Id] = item
	return connect.NewResponse(proto.Clone(item).(*contentv1.Content)), nil
}

func (s *ContentServer) UpdateContent(
	_ context.Context,
	req *connect.Request[contentv1.UpdateContentRequest],
) (*connect.Response[contentv1.Content], error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.store[req.Msg.Id]
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("content %s not found", req.Msg.Id))
	}

	if req.Msg.Title != nil {
		item.Title = *req.Msg.Title
	}
	if req.Msg.Body != nil {
		item.Body = *req.Msg.Body
	}
	if req.Msg.Status != nil {
		item.Status = *req.Msg.Status
	}
	item.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	return connect.NewResponse(proto.Clone(item).(*contentv1.Content)), nil
}

func (s *ContentServer) DeleteContent(
	_ context.Context,
	req *connect.Request[contentv1.DeleteContentRequest],
) (*connect.Response[contentv1.DeleteContentResponse], error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.store[req.Msg.Id]; !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("content %s not found", req.Msg.Id))
	}
	delete(s.store, req.Msg.Id)

	return connect.NewResponse(&contentv1.DeleteContentResponse{
		Success: true,
	}), nil
}
