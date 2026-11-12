import { Controller, Sse, MessageEvent, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('M0 Platform — Realtime & Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  /**
   * GET /events/stream - Server-Sent Events (SSE) live feed
   * Emits live events for approvals, orders, notifications, and heartbeat
   */
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Realtime Server-Sent Events stream (G-RT-1)' })
  stream(@Req() req: any): Observable<MessageEvent> {
    const initial$ = new Observable<MessageEvent>((subscriber) => {
      subscriber.next({
        data: {
          type: 'connected',
          userId: req.user?.id,
          role: req.user?.role,
          siteId: req.user?.siteId,
          timestamp: new Date().toISOString(),
        },
      });
    });

    const heartbeat$ = interval(15000).pipe(
      map(() => ({
        data: {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        },
      })),
    );

    return merge(initial$, heartbeat$);
  }
}

