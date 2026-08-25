// Package loop is the worker main-loop: heartbeat, system info, claim, dispatch.
// Mirrors worker/loop.py.
package loop

import (
	"context"
	"errors"
	"math"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/opensible/worker-go/internal/execute"
	"github.com/opensible/worker-go/internal/httpclient"
	"github.com/opensible/worker-go/internal/logging"
	"github.com/opensible/worker-go/internal/redaction"
	"github.com/opensible/worker-go/internal/serviceops"
	"github.com/opensible/worker-go/internal/systeminfo"
)

// Options configures the worker loop.
type serviceReporter struct{ client *httpclient.Client }

func (r serviceReporter) SendServiceLog(id, token, text string, ts float64) bool {
	return r.client.SendServiceLog(id, token, text, ts)
}
func (r serviceReporter) FinishServiceExecution(id, token, status string, at float64, duration int, code *int, err string, result map[string]any) bool {
	return r.client.FinishServiceExecution(id, token, status, at, duration, code, err, result)
}
func (r serviceReporter) HeartbeatWithLease(id, token string) (bool, bool) {
	return r.client.HeartbeatWithLease(id, token)
}

const maxClaimConflictRetries = 5

func claimConflictBackoff(pollInterval time.Duration, retries int) time.Duration {
	if retries < 1 {
		retries = 1
	}
	if retries > maxClaimConflictRetries {
		retries = maxClaimConflictRetries
	}
	backoff := float64(pollInterval) * math.Pow(2, float64(retries))
	if backoff > float64(60*time.Second) {
		backoff = float64(60 * time.Second)
	}
	return time.Duration(backoff)
}

type Options struct {
	ServerURL      string
	PollInterval   int
	ProjectID      string
	WorkerName     string
	MaxConcurrency int
	Tags           []string
	Capabilities   map[string]any
}

var shutdown atomic.Bool

// Run enters the main worker loop.
func Run(opts Options) {
	log := logging.L()
	if opts.WorkerName == "" {
		if h, err := os.Hostname(); err == nil {
			opts.WorkerName = h
		} else {
			opts.WorkerName = "worker"
		}
	}
	if opts.PollInterval <= 0 {
		opts.PollInterval = 3
	}
	if opts.MaxConcurrency <= 0 {
		opts.MaxConcurrency = 1
	}

	client := httpclient.New(opts.ServerURL)
	if !client.WaitUntilReady(90 * time.Second) {
		log.Warn("Backend health check did not become ready before timeout; continuing with normal retry loop")
	}

	if client.WorkerToken == "" {
		log.Info("No token found, registering worker...")
		if _, err := client.Register(opts.WorkerName, opts.Capabilities); err != nil {
			log.Error("Failed to register worker", "err", redaction.Text(err.Error()))
			return
		}
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		s := <-sigCh
		log.Info("Received signal, shutting down", "signal", s.String())
		shutdown.Store(true)
	}()

	log.Info("Worker started, waiting for tasks...", "maxConcurrency", opts.MaxConcurrency)

	pollInterval := time.Duration(opts.PollInterval) * time.Second
	heartbeatInterval := 30 * time.Second
	sysInfoInterval := 300 * time.Second
	sysInfoRetry := 30 * time.Second
	logReloadInterval := 60 * time.Second

	var lastHeartbeat, lastSysSent, lastSysAttempt, lastLogReload time.Time
	needReregister := false
	rateLimitRetries := 0
	claimConflictRetries := 0
	const maxRateLimitRetries = 5

	// Concurrency semaphore: cap in-flight executions at MaxConcurrency.
	sem := make(chan struct{}, opts.MaxConcurrency)

	// Initial system-info push (best-effort).
	if info := systeminfo.Collect(); info != nil {
		lastSysAttempt = time.Now()
		if client.SendSystemInfo(info) {
			lastSysSent = time.Now()
			log.Debug("System info sent at startup")
		}
	}

	for !shutdown.Load() {
		now := time.Now()

		// Heartbeat.
		if now.Sub(lastHeartbeat) >= heartbeatInterval {
			ok, wantSys := client.Heartbeat("")
			if ok {
				lastHeartbeat = now
				needReregister = false
			} else if !needReregister {
				log.Warn("Heartbeat failed - will re-register on next claim")
				needReregister = true
			}
			if wantSys {
				if info := systeminfo.Collect(); info != nil {
					if client.SendSystemInfo(info) {
						lastSysSent = time.Now()
					}
				}
			}
		}

		// System info periodic push.
		needSend := now.Sub(lastSysSent) >= sysInfoInterval ||
			(lastSysSent.IsZero() && now.Sub(lastSysAttempt) >= sysInfoRetry)
		if needSend {
			info := systeminfo.Collect()
			lastSysAttempt = now
			if info != nil && client.SendSystemInfo(info) {
				lastSysSent = now
			}
		}

		// Log level reload.
		if now.Sub(lastLogReload) >= logReloadInterval {
			logging.ReloadLogLevel()
			lastLogReload = now
		}

		// Only claim if we have a free slot; otherwise sleep briefly.
		select {
		case sem <- struct{}{}:
		default:
			time.Sleep(pollInterval)
			continue
		}

		// Claim.
		execData, err := client.Claim(opts.ProjectID, opts.MaxConcurrency, opts.Tags)
		if err != nil {
			<-sem // release reserved slot on claim failure
			var httpErr *httpclient.HTTPError
			isHTTP := errors.As(err, &httpErr)
			es := err.Error()
			is401 := (isHTTP && httpErr.Status == 401) || strings.Contains(strings.ToUpper(es), "UNAUTHORIZED")
			is429 := (isHTTP && httpErr.Status == 429) || strings.Contains(strings.ToUpper(es), "TOO MANY REQUESTS")
			isConflict := isHTTP && httpErr.Status == 409

			if is401 {

				log.Warn("Claim returned 401, re-registering...")
				if _, err := client.Register(opts.WorkerName, opts.Capabilities); err != nil {
					log.Error("Failed to re-register worker", "err", redaction.Text(err.Error()))
					needReregister = true
					time.Sleep(pollInterval)
					continue
				}
				needReregister = false
				continue
			}
			if isConflict {
				if claimConflictRetries < maxRateLimitRetries {
					claimConflictRetries++
				}
				backoff := claimConflictBackoff(time.Duration(opts.PollInterval)*time.Second, claimConflictRetries)

				log.Warn("Claim conflict", "attempt", claimConflictRetries, "sleep", backoff)
				time.Sleep(backoff)
				continue
			}
			if is429 {
				if rateLimitRetries < maxRateLimitRetries {

					rateLimitRetries++
				}
				backoff := time.Duration(math.Min(60, float64(opts.PollInterval)*math.Pow(2, math.Min(5, float64(rateLimitRetries))))) * time.Second
				log.Warn("Rate limited", "attempt", rateLimitRetries, "sleep", backoff)
				time.Sleep(backoff)
				continue
			}
			rateLimitRetries = 0
			claimConflictRetries = 0
			log.Error("Claim failed", "err", redaction.Text(err.Error()))

			time.Sleep(pollInterval)
			continue
		}
		rateLimitRetries = 0
		claimConflictRetries = 0
		needReregister = false

		if execData == nil {
			claimConflictRetries = 0
			<-sem // nothing to run — release slot

			time.Sleep(pollInterval)
			continue
		}

		execID, _ := execData["executionId"].(string)
		projID, _ := execData["projectId"].(string)
		log.Debug("Claimed execution", "id", execID, "project", projID)
		go func(id string, data map[string]any, pid string) {
			defer func() { <-sem }()
			if _, isServiceOperation := data["serviceOperation"]; isServiceOperation {
				serviceops.Runner{Providers: map[string]serviceops.Provider{"mock": serviceops.MockProvider{}}}.Run(
					context.Background(), data, serviceReporter{client},
				)
				return
			}
			execute.Run(id, data, pid, client)
		}(execID, execData, projID)
	}

	log.Info("Worker stopped")
}
