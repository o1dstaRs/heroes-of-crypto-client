export interface TouchPoint {
    x: number;
    y: number;
}

export interface TouchBoardView {
    zoom: number;
    x: number;
    y: number;
}

interface Contact {
    start: TouchPoint;
    point: TouchPoint;
    client: TouchPoint;
    time: number;
    moved: boolean;
}

interface TouchBoardOptions {
    size: () => { width: number; height: number };
    zoomAnchor?: () => TouchPoint;
    toPoint: (client: TouchPoint) => TouchPoint;
    onTap: (client: TouchPoint, inspect: boolean) => void;
    onView: (view: TouchBoardView) => void;
    onGesture: () => void;
    onScroll?: (client: TouchPoint, delta: TouchPoint) => boolean;
}

const distance = (a: TouchPoint, b: TouchPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: TouchPoint, b: TouchPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** A gesture owns every contact until all fingers leave; lifting one finger never becomes a board tap. */
export class TouchBoardInput {
    private contacts = new Map<number, Contact>();
    private gesture = false;
    private view: TouchBoardView = { zoom: 1, x: 0, y: 0 };
    private touchOwnsMouse = false;
    public constructor(private options: TouchBoardOptions) {}
    public ignoreMouse(): boolean {
        return this.touchOwnsMouse;
    }
    public allowMouse(): void {
        this.touchOwnsMouse = false;
    }
    public down(id: number, client: TouchPoint, now = performance.now()): void {
        const point = this.options.toPoint(client);
        this.contacts.set(id, { start: point, point, client, time: now, moved: false });
        this.touchOwnsMouse = true;
        if (this.contacts.size > 1) {
            this.gesture = true;
            this.options.onGesture();
        }
    }
    public move(id: number, client: TouchPoint): void {
        const contact = this.contacts.get(id);
        if (!contact) return;
        const point = this.options.toPoint(client);
        const previous = contact.point;
        const pair = [...this.contacts.values()].slice(0, 2);
        const beforeMidpoint = pair.length === 2 ? midpoint(pair[0].point, pair[1].point) : previous;
        const beforeDistance = pair.length === 2 ? distance(pair[0].point, pair[1].point) : 0;
        contact.point = point;
        contact.client = client;
        contact.moved ||= distance(contact.start, point) > 9;
        if (pair.length === 2) {
            const center = midpoint(pair[0].point, pair[1].point);
            const zoom =
                beforeDistance > 2
                    ? (this.view.zoom * distance(pair[0].point, pair[1].point)) / beforeDistance
                    : this.view.zoom;
            this.zoomAt(zoom, beforeMidpoint, center);
        } else if (contact.moved) {
            this.gesture = true;
            this.options.onGesture();
            const delta = { x: point.x - previous.x, y: point.y - previous.y };
            if (this.view.zoom === 1 && this.options.onScroll?.(client, delta)) return;
            this.setView({ ...this.view, x: this.view.x + delta.x, y: this.view.y + delta.y });
        }
    }
    public up(id: number, now = performance.now()): void {
        const contact = this.contacts.get(id);
        if (!contact) return;
        this.contacts.delete(id);
        if (!this.gesture && !contact.moved) this.options.onTap(contact.client, now - contact.time >= 500);
        if (this.contacts.size === 0) this.gesture = false;
    }
    public cancel(notify = true): void {
        this.contacts.clear();
        this.gesture = false;
        this.touchOwnsMouse = true;
        if (notify) this.options.onGesture();
    }
    public zoomBy(factor: number): void {
        const { width, height } = this.options.size();
        this.options.onGesture();
        this.zoomAt(this.view.zoom * factor, this.options.zoomAnchor?.() ?? { x: width / 2, y: height / 2 });
    }
    public reset(notify = true): void {
        this.cancel(notify);
        this.setView({ zoom: 1, x: 0, y: 0 });
    }
    private zoomAt(requestedZoom: number, anchor: TouchPoint, destination = anchor): void {
        const { width, height } = this.options.size();
        const zoom = Math.max(1, Math.min(3.5, requestedZoom));
        const ratio = zoom / this.view.zoom;
        this.setView({
            zoom,
            x: destination.x - width / 2 - (anchor.x - width / 2 - this.view.x) * ratio,
            y: destination.y - height / 2 - (anchor.y - height / 2 - this.view.y) * ratio,
        });
    }
    private setView(next: TouchBoardView): void {
        const { width, height } = this.options.size();
        const maxX = (width * (next.zoom - 1)) / 2;
        const maxY = (height * (next.zoom - 1)) / 2;
        this.view = {
            zoom: next.zoom,
            x: Math.max(-maxX, Math.min(maxX, next.x)),
            y: Math.max(-maxY, Math.min(maxY, next.y)),
        };
        this.options.onView(this.view);
    }
}
