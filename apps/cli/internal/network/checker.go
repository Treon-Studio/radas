package network

import (
	"context"
	"time"

	"github.com/showwin/speedtest-go/speedtest"
)

type CheckResult struct {
	Connected bool
	Latency   time.Duration
	Error     error
}

func Check(ctx context.Context) CheckResult {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	serverList, err := speedtest.FetchServerListContext(ctx)
	if err != nil {
		return CheckResult{Connected: false, Error: err}
	}

	best, err := serverList.FindServer([]int{})
	if err != nil {
		return CheckResult{Connected: false, Error: err}
	}
	if len(best) == 0 {
		return CheckResult{Connected: false, Error: speedtest.ErrServerNotFound}
	}

	var ping time.Duration
	err = best[0].PingTestContext(ctx, func(latency time.Duration) {
		ping = latency
	})
	if err != nil {
		return CheckResult{Connected: false, Error: err}
	}

	return CheckResult{
		Connected: true,
		Latency:   ping,
	}
}
