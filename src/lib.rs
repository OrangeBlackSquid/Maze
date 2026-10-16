use wasm_bindgen::prelude::*;

const WALL_N: u8 = 0b0000_0001;
const WALL_E: u8 = 0b0000_0010;
const WALL_S: u8 = 0b0000_0100;
const WALL_W: u8 = 0b0000_1000;
const WALL_ALL: u8 = WALL_N | WALL_E | WALL_S | WALL_W;

const GEN_VISITED: u8 = 0b0001_0000;
const GEN_CURRENT: u8 = 0b0010_0000;
const GEN_FRONTIER: u8 = 0b0100_0000;
const GEN_PATH: u8 = 0b1000_0000;

const SOLVE_VISITED: u8 = 0b0000_0001;
const SOLVE_CURRENT: u8 = 0b0000_0010;
const SOLVE_CLOSED: u8 = 0b0000_0100;
const SOLVE_PATH: u8 = 0b0000_1000;
const SOLVE_DEAD: u8 = 0b0001_0000;

pub const GEN_DFS: u8 = 0;
pub const GEN_PRIM: u8 = 1;
pub const GEN_KRUSKAL: u8 = 2;
pub const GEN_WILSON: u8 = 3;
pub const GEN_BINARY: u8 = 4;

pub const SOLVE_ASTAR: u8 = 0;
pub const SOLVE_WALL: u8 = 1;
pub const SOLVE_DEADEND: u8 = 2;
pub const SOLVE_FLOOD: u8 = 3;
pub const SOLVE_TREMAUX: u8 = 4;

struct Rng {
    s: [u32; 4],
}

impl Rng {
    fn new(seed: u64) -> Self {
        Rng {
            s: [
                (seed as u32) | 1,
                ((seed >> 32) as u32) | 1,
                0x9E37_79B9,
                0x85EB_CA6B,
            ],
        }
    }
    fn next(&mut self) -> u32 {
        let t = self.s[1] << 9;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(11);
        self.s[0]
    }
    fn range(&mut self, n: u32) -> u32 {
        if n == 0 { 0 } else { self.next() % n }
    }
}

fn idx(x: u32, y: u32, cols: u32) -> u32 {
    y * cols + x
}

fn x_of(i: u32, cols: u32) -> u32 { i % cols }
fn y_of(i: u32, cols: u32) -> u32 { i / cols }

#[wasm_bindgen]
pub struct Maze {
    rows: u32,
    cols: u32,
    cells: Vec<u8>,
    solve: Vec<u8>,
    solve_dist: Vec<u32>,
    solve_parent: Vec<i32>,
    start: u32,
    goal: u32,
    rng: Rng,

    gen_kind: u8,
    gen_done: bool,
    gen_stack: Vec<u32>,
    gen_frontier: Vec<u32>,
    gen_edges: Vec<u32>,
    gen_edge_idx: u32,
    gen_uf: Vec<u32>,
    gen_uf_rank: Vec<u8>,
    gen_in_maze: Vec<u8>,
    gen_remaining: Vec<u32>,
    gen_path: Vec<u32>,
    gen_cursor: u32,

    solve_kind: u8,
    solve_done: bool,
    solve_queue: Vec<u32>,
    solve_qhead: u32,
    solve_heap: Vec<(u32, u32)>,
    solve_tremaux: Vec<u32>,
    solve_wall_dir: u8,
    solve_wall_path: Vec<u32>,
    solve_steps: u32,

    render_buf: Vec<u8>,
    render_w: u32,
    render_h: u32,
}

#[wasm_bindgen]
impl Maze {
    #[wasm_bindgen(constructor)]
    pub fn new(rows: u32, cols: u32) -> Maze {
        let mut m = Maze {
            rows: 1,
            cols: 1,
            cells: Vec::new(),
            solve: Vec::new(),
            solve_dist: Vec::new(),
            solve_parent: Vec::new(),
            start: 0,
            goal: 0,
            rng: Rng::new(0xCAFE_BABE_DEAD_BEEF),
            gen_kind: GEN_DFS,
            gen_done: true,
            gen_stack: Vec::new(),
            gen_frontier: Vec::new(),
            gen_edges: Vec::new(),
            gen_edge_idx: 0,
            gen_uf: Vec::new(),
            gen_uf_rank: Vec::new(),
            gen_in_maze: Vec::new(),
            gen_remaining: Vec::new(),
            gen_path: Vec::new(),
            gen_cursor: 0,
            solve_kind: SOLVE_ASTAR,
            solve_done: true,
            solve_queue: Vec::new(),
            solve_qhead: 0,
            solve_heap: Vec::new(),
            solve_tremaux: Vec::new(),
            solve_wall_dir: 0,
            solve_wall_path: Vec::new(),
            solve_steps: 0,
            render_buf: Vec::new(),
            render_w: 0,
            render_h: 0,
        };
        m.set_size(rows, cols);
        m
    }

    pub fn seed(&mut self, s: u64) {
        self.rng = Rng::new(s);
    }

    pub fn rows(&self) -> u32 { self.rows }
    pub fn cols(&self) -> u32 { self.cols }
    pub fn start(&self) -> u32 { self.start }
    pub fn goal(&self) -> u32 { self.goal }
    pub fn set_start(&mut self, i: u32) { self.start = i.min(self.rows * self.cols - 1); }
    pub fn set_goal(&mut self, i: u32) { self.goal = i.min(self.rows * self.cols - 1); }
    pub fn set_start_xy(&mut self, x: u32, y: u32) { self.start = idx(x.min(self.cols - 1), y.min(self.rows - 1), self.cols); }
    pub fn set_goal_xy(&mut self, x: u32, y: u32) { self.goal = idx(x.min(self.cols - 1), y.min(self.rows - 1), self.cols); }

    pub fn set_size(&mut self, rows: u32, cols: u32) {
        self.rows = rows.max(1).min(1000);
        self.cols = cols.max(1).min(1000);
        let n = (self.rows * self.cols) as usize;
        self.cells = vec![WALL_ALL; n];
        self.solve = vec![0; n];
        self.solve_dist = vec![0; n];
        self.solve_parent = vec![-1; n];
        self.start = 0;
        self.goal = (self.rows * self.cols) - 1;
        self.gen_stack.clear();
        self.gen_frontier.clear();
        self.gen_edges.clear();
        self.gen_uf.clear();
        self.gen_uf_rank.clear();
        self.gen_in_maze.clear();
        self.gen_remaining.clear();
        self.gen_path.clear();
        self.gen_cursor = 0;
        self.solve_queue.clear();
        self.solve_qhead = 0;
        self.solve_heap.clear();
        self.solve_tremaux.clear();
        self.solve_wall_path.clear();
        self.solve_wall_dir = 0;
        self.solve_steps = 0;
        self.gen_done = true;
        self.solve_done = true;
    }

    pub fn clear_gen_markers(&mut self) {
        for c in self.cells.iter_mut() {
            *c &= !(GEN_VISITED | GEN_CURRENT | GEN_FRONTIER | GEN_PATH);
        }
    }

    pub fn clear_solve_markers(&mut self) {
        for s in self.solve.iter_mut() {
            *s = 0;
        }
    }

    pub fn reset_walls(&mut self) {
        for c in self.cells.iter_mut() {
            *c = WALL_ALL;
        }
        self.clear_solve_markers();
    }

    fn neighbor(&self, i: u32, dir: u8) -> Option<u32> {
        let x = x_of(i, self.cols);
        let y = y_of(i, self.cols);
        match dir {
            0 => if y > 0 { Some(idx(x, y - 1, self.cols)) } else { None },
            1 => if x + 1 < self.cols { Some(idx(x + 1, y, self.cols)) } else { None },
            2 => if y + 1 < self.rows { Some(idx(x, y + 1, self.cols)) } else { None },
            3 => if x > 0 { Some(idx(x - 1, y, self.cols)) } else { None },
            _ => None,
        }
    }

    fn remove_wall_between(&mut self, a: u32, b: u32) {
        let ax = x_of(a, self.cols);
        let ay = y_of(a, self.cols);
        let bx = x_of(b, self.cols);
        let by = y_of(b, self.cols);
        if bx == ax + 1 && by == ay {
            self.cells[a as usize] &= !WALL_E;
            self.cells[b as usize] &= !WALL_W;
        } else if bx + 1 == ax && by == ay {
            self.cells[a as usize] &= !WALL_W;
            self.cells[b as usize] &= !WALL_E;
        } else if bx == ax && by == ay + 1 {
            self.cells[a as usize] &= !WALL_S;
            self.cells[b as usize] &= !WALL_N;
        } else if bx == ax && by + 1 == ay {
            self.cells[a as usize] &= !WALL_N;
            self.cells[b as usize] &= !WALL_S;
        }
    }

    pub fn remove_wall(&mut self, a: u32, b: u32) {
        if a >= self.rows * self.cols || b >= self.rows * self.cols { return; }
        self.remove_wall_between(a, b);
    }

    fn has_wall(&self, i: u32, dir: u8) -> bool {
        let bit = match dir {
            0 => WALL_N,
            1 => WALL_E,
            2 => WALL_S,
            3 => WALL_W,
            _ => return true,
        };
        self.cells[i as usize] & bit != 0
    }

    fn open_neighbors(&self, i: u32) -> Vec<u32> {
        let mut out = Vec::with_capacity(4);
        for d in 0..4u8 {
            if !self.has_wall(i, d) {
                if let Some(n) = self.neighbor(i, d) {
                    out.push(n);
                }
            }
        }
        out
    }

    pub fn start_generate(&mut self, kind: u8) {
        self.clear_gen_markers();
        self.clear_solve_markers();
        for c in self.cells.iter_mut() {
            *c |= WALL_ALL;
        }
        self.gen_kind = kind;
        self.gen_done = false;
        self.gen_stack.clear();
        self.gen_frontier.clear();
        self.gen_edges.clear();
        self.gen_edge_idx = 0;
        self.gen_uf.clear();
        self.gen_uf_rank.clear();
        self.gen_in_maze.clear();
        self.gen_remaining.clear();
        self.gen_path.clear();
        self.gen_cursor = 0;

        let total = self.rows * self.cols;
        match kind {
            GEN_DFS => {
                let s = self.rng.range(total);
                self.cells[s as usize] |= GEN_VISITED | GEN_CURRENT;
                self.gen_stack.push(s);
            }
            GEN_PRIM => {
                let s = self.rng.range(total);
                self.cells[s as usize] |= GEN_VISITED | GEN_CURRENT;
                for d in 0..4u8 {
                    if let Some(n) = self.neighbor(s, d) {
                        if self.cells[n as usize] & GEN_VISITED == 0 {
                            self.cells[n as usize] |= GEN_FRONTIER;
                            self.gen_frontier.push(n);
                        }
                    }
                }
            }
            GEN_KRUSKAL => {
                let mut edges = Vec::with_capacity((total * 2) as usize);
                for y in 0..self.rows {
                    for x in 0..self.cols {
                        let i = idx(x, y, self.cols);
                        if x + 1 < self.cols {
                            edges.push((i << 2) | 1);
                        }
                        if y + 1 < self.rows {
                            edges.push((i << 2) | 2);
                        }
                    }
                }
                for k in (1..edges.len()).rev() {
                    let j = self.rng.range((k + 1) as u32) as usize;
                    edges.swap(k, j);
                }
                self.gen_edges = edges;
                self.gen_uf = (0..total).collect();
                self.gen_uf_rank = vec![0; total as usize];
            }
            GEN_WILSON => {
                let total = self.rows * self.cols;
                self.gen_in_maze = vec![0; total as usize];
                self.gen_remaining = Vec::with_capacity(total as usize);
                for i in 0..total {
                    self.gen_remaining.push(i);
                }
                let first = self.rng.range(total);
                self.gen_in_maze[first as usize] = 1;
                self.cells[first as usize] |= GEN_VISITED;
                self.gen_remaining.retain(|&x| x != first);
                self.gen_cursor = 0;
            }
            GEN_BINARY => {
                self.gen_cursor = 0;
            }
            _ => {
                self.gen_done = true;
            }
        }
    }

    pub fn step_generate(&mut self, n: u32) -> bool {
        if self.gen_done { return true; }
        for _ in 0..n {
            if self.gen_done { break; }
            match self.gen_kind {
                GEN_DFS => self.step_dfs(),
                GEN_PRIM => self.step_prim(),
                GEN_KRUSKAL => self.step_kruskal(),
                GEN_WILSON => self.step_wilson(),
                GEN_BINARY => self.step_binary(),
                _ => self.gen_done = true,
            }
        }
        self.gen_done
    }

    fn step_dfs(&mut self) {
        if self.gen_stack.is_empty() {
            self.gen_done = true;
            return;
        }
        let cur = *self.gen_stack.last().unwrap();
        let mut unvisited = Vec::with_capacity(4);
        for d in 0..4u8 {
            if let Some(n) = self.neighbor(cur, d) {
                if self.cells[n as usize] & GEN_VISITED == 0 {
                    unvisited.push((d, n));
                }
            }
        }
        if unvisited.is_empty() {
            self.cells[cur as usize] &= !GEN_CURRENT;
            self.gen_stack.pop();
            if let Some(&top) = self.gen_stack.last() {
                self.cells[top as usize] |= GEN_CURRENT;
            }
        } else {
            let pick = self.rng.range(unvisited.len() as u32) as usize;
            let (_, next) = unvisited[pick];
            self.remove_wall_between(cur, next);
            self.cells[cur as usize] &= !GEN_CURRENT;
            self.cells[next as usize] |= GEN_VISITED | GEN_CURRENT;
            self.gen_stack.push(next);
        }
    }

    fn step_prim(&mut self) {
        if self.gen_frontier.is_empty() {
            self.gen_done = true;
            return;
        }
        let i = self.rng.range(self.gen_frontier.len() as u32) as usize;
        let cell = self.gen_frontier.swap_remove(i);
        self.cells[cell as usize] &= !GEN_FRONTIER;

        let mut visited_neighbors = Vec::with_capacity(4);
        for d in 0..4u8 {
            if let Some(n) = self.neighbor(cell, d) {
                if self.cells[n as usize] & GEN_VISITED != 0 {
                    visited_neighbors.push(n);
                }
            }
        }
        if visited_neighbors.is_empty() {
            return;
        }
        let p = visited_neighbors[self.rng.range(visited_neighbors.len() as u32) as usize];
        self.remove_wall_between(p, cell);
        self.cells[cell as usize] |= GEN_VISITED | GEN_CURRENT;
        self.cells[cell as usize] &= !GEN_CURRENT;

        for d in 0..4u8 {
            if let Some(n) = self.neighbor(cell, d) {
                if self.cells[n as usize] & GEN_VISITED == 0 && self.cells[n as usize] & GEN_FRONTIER == 0 {
                    self.cells[n as usize] |= GEN_FRONTIER;
                    self.gen_frontier.push(n);
                }
            }
        }
    }

    fn uf_find(parent: &mut [u32], mut i: u32) -> u32 {
        while parent[i as usize] != i {
            parent[i as usize] = parent[parent[i as usize] as usize];
            i = parent[i as usize];
        }
        i
    }

    fn step_kruskal(&mut self) {
        if self.gen_edge_idx >= self.gen_edges.len() as u32 {
            self.gen_done = true;
            for c in self.cells.iter_mut() {
                *c |= GEN_VISITED;
            }
            return;
        }
        let e = self.gen_edges[self.gen_edge_idx as usize];
        self.gen_edge_idx += 1;
        let cell = e >> 2;
        let dir = (e & 3) as u8;
        let other = match self.neighbor(cell, dir) {
            Some(n) => n,
            None => return,
        };
        self.cells[cell as usize] |= GEN_CURRENT;
        self.cells[other as usize] |= GEN_CURRENT;

        let a = Self::uf_find(&mut self.gen_uf, cell);
        let b = Self::uf_find(&mut self.gen_uf, other);
        if a != b {
            let ra = self.gen_uf_rank[a as usize];
            let rb = self.gen_uf_rank[b as usize];
            if ra < rb {
                self.gen_uf[a as usize] = b;
            } else if ra > rb {
                self.gen_uf[b as usize] = a;
            } else {
                self.gen_uf[b as usize] = a;
                self.gen_uf_rank[a as usize] += 1;
            }
            self.remove_wall_between(cell, other);
            self.cells[cell as usize] |= GEN_VISITED;
            self.cells[other as usize] |= GEN_VISITED;
        }
        self.cells[cell as usize] &= !GEN_CURRENT;
        self.cells[other as usize] &= !GEN_CURRENT;
    }

    fn step_wilson(&mut self) {
        if self.gen_remaining.is_empty() {
            self.gen_done = true;
            for c in self.cells.iter_mut() {
                *c |= GEN_VISITED;
            }
            return;
        }
        if self.gen_path.is_empty() {
            let i = self.rng.range(self.gen_remaining.len() as u32) as usize;
            let start = self.gen_remaining[i];
            self.gen_path.push(start);
            self.cells[start as usize] |= GEN_CURRENT;
            return;
        }
        let cur = *self.gen_path.last().unwrap();
        if self.gen_in_maze[cur as usize] == 1 {
            let mut prev: Option<u32> = None;
            let path = self.gen_path.clone();
            for &c in path.iter() {
                self.cells[c as usize] &= !GEN_CURRENT;
                if let Some(p) = prev {
                    self.remove_wall_between(p, c);
                    self.cells[c as usize] |= GEN_VISITED;
                    self.gen_in_maze[c as usize] = 1;
                    self.gen_remaining.retain(|&x| x != c);
                }
                prev = Some(c);
            }
            self.gen_path.clear();
            return;
        }
        let mut open = Vec::with_capacity(4);
        for d in 0..4u8 {
            if let Some(n) = self.neighbor(cur, d) {
                open.push(n);
            }
        }
        if open.is_empty() {
            self.gen_path.pop();
            return;
        }
        let next = open[self.rng.range(open.len() as u32) as usize];
        let loop_pos = self.gen_path.iter().position(|&x| x == next);
        if let Some(p) = loop_pos {
            for k in (p + 1)..self.gen_path.len() {
                let c = self.gen_path[k];
                self.cells[c as usize] &= !(GEN_CURRENT | GEN_PATH);
            }
            self.gen_path.truncate(p + 1);
        } else {
            self.cells[cur as usize] &= !GEN_CURRENT;
            self.cells[next as usize] |= GEN_CURRENT | GEN_PATH;
            self.gen_path.push(next);
        }
    }

    fn step_binary(&mut self) {
        let total = self.rows * self.cols;
        if self.gen_cursor >= total {
            self.gen_done = true;
            return;
        }
        let i = self.gen_cursor;
        self.gen_cursor += 1;
        let x = x_of(i, self.cols);
        let y = y_of(i, self.cols);
        self.cells[i as usize] |= GEN_VISITED | GEN_CURRENT;
        self.cells[i as usize] &= !GEN_CURRENT;

        let can_n = y > 0;
        let can_w = x > 0;
        if !can_n && !can_w { return; }
        let pick_n = if !can_n { false } else if !can_w { true } else { self.rng.next() & 1 == 0 };
        if pick_n {
            let n = idx(x, y - 1, self.cols);
            self.remove_wall_between(i, n);
        } else {
            let n = idx(x - 1, y, self.cols);
            self.remove_wall_between(i, n);
        }
    }

    pub fn generate_all(&mut self, kind: u8) {
        self.start_generate(kind);
        let max_steps = self.rows * self.cols * 4 + 16;
        let mut left = max_steps;
        while !self.gen_done && left > 0 {
            self.step_generate(4096);
            left = left.saturating_sub(4096);
        }
        self.clear_gen_markers();
    }

    pub fn start_solve(&mut self, kind: u8) {
        self.clear_solve_markers();
        self.clear_gen_markers();
        self.solve_kind = kind;
        self.solve_done = false;
        self.solve_queue.clear();
        self.solve_qhead = 0;
        self.solve_heap.clear();
        self.solve_tremaux.clear();
        self.solve_wall_path.clear();
        self.solve_wall_dir = 0;
        self.solve_steps = 0;

        for i in 0..self.solve_dist.len() {
            self.solve_dist[i] = u32::MAX;
            self.solve_parent[i] = -1;
        }

        match kind {
            SOLVE_ASTAR => {
                self.solve_dist[self.start as usize] = 0;
                let h = self.heuristic(self.start, self.goal);
                self.heap_push(h, self.start);
                self.solve[self.start as usize] |= SOLVE_VISITED;
            }
            SOLVE_WALL => {
                self.solve[self.start as usize] |= SOLVE_VISITED | SOLVE_CURRENT;
                self.solve_wall_dir = 1;
                self.solve_wall_path.push(self.start);
            }
            SOLVE_DEADEND => {}
            SOLVE_FLOOD => {
                self.solve_queue.push(self.start);
                self.solve[self.start as usize] |= SOLVE_VISITED;
                self.solve_parent[self.start as usize] = -1;
            }
            SOLVE_TREMAUX => {
                self.solve_tremaux.push(self.start);
                self.solve[self.start as usize] |= SOLVE_VISITED | SOLVE_CURRENT;
            }
            _ => self.solve_done = true,
        }
    }

    pub fn step_solve(&mut self, n: u32) -> bool {
        if self.solve_done { return true; }
        for _ in 0..n {
            if self.solve_done { break; }
            match self.solve_kind {
                SOLVE_ASTAR => self.step_astar(),
                SOLVE_WALL => self.step_wall(),
                SOLVE_DEADEND => self.step_deadend(),
                SOLVE_FLOOD => self.step_flood(),
                SOLVE_TREMAUX => self.step_tremaux(),
                _ => self.solve_done = true,
            }
        }
        self.solve_done
    }

    fn heuristic(&self, a: u32, b: u32) -> u32 {
        let ax = x_of(a, self.cols) as i32;
        let ay = y_of(a, self.cols) as i32;
        let bx = x_of(b, self.cols) as i32;
        let by = y_of(b, self.cols) as i32;
        ((ax - bx).abs() + (ay - by).abs()) as u32
    }

    fn heap_push(&mut self, f: u32, cell: u32) {
        self.solve_heap.push((f, cell));
        let mut i = self.solve_heap.len() - 1;
        while i > 0 {
            let parent = (i - 1) / 2;
            if self.solve_heap[parent].0 <= self.solve_heap[i].0 { break; }
            self.solve_heap.swap(parent, i);
            i = parent;
        }
    }

    fn heap_pop(&mut self) -> Option<(u32, u32)> {
        if self.solve_heap.is_empty() { return None; }
        let n = self.solve_heap.len();
        self.solve_heap.swap(0, n - 1);
        let last = self.solve_heap.pop();
        let mut i = 0;
        let len = self.solve_heap.len();
        loop {
            let l = 2 * i + 1;
            let r = 2 * i + 2;
            let mut smallest = i;
            if l < len && self.solve_heap[l].0 < self.solve_heap[smallest].0 { smallest = l; }
            if r < len && self.solve_heap[r].0 < self.solve_heap[smallest].0 { smallest = r; }
            if smallest == i { break; }
            self.solve_heap.swap(i, smallest);
            i = smallest;
        }
        last
    }

    fn reconstruct_path(&mut self) {
        let mut cur = self.goal as i32;
        let mut guard = self.rows * self.cols;
        while cur >= 0 && guard > 0 {
            let c = cur as u32;
            self.solve[c as usize] |= SOLVE_PATH | SOLVE_CURRENT;
            if c == self.start { break; }
            cur = self.solve_parent[c as usize];
            guard -= 1;
        }
    }

    fn step_astar(&mut self) {
        if self.goal == self.start {
            self.reconstruct_path();
            self.solve_done = true;
            return;
        }
        loop {
            let entry = match self.heap_pop() {
                Some(e) => e,
                None => { self.solve_done = true; return; }
            };
            let (f, cell) = entry;
            let g = self.solve_dist[cell as usize];
            if g == u32::MAX { continue; }
            if g + self.heuristic(cell, self.goal) != f { continue; }

            if cell == self.goal {
                self.reconstruct_path();
                self.solve_done = true;
                return;
            }

            self.solve[cell as usize] |= SOLVE_CURRENT;
            self.solve[cell as usize] |= SOLVE_CLOSED;
            self.solve[cell as usize] &= !SOLVE_CURRENT;

            for n in self.open_neighbors(cell) {
                if self.solve[n as usize] & SOLVE_CLOSED != 0 { continue; }
                let ng = g + 1;
                if ng < self.solve_dist[n as usize] {
                    self.solve_dist[n as usize] = ng;
                    self.solve_parent[n as usize] = cell as i32;
                    self.solve[n as usize] |= SOLVE_VISITED;
                    let nf = ng + self.heuristic(n, self.goal);
                    self.heap_push(nf, n);
                }
            }
            return;
        }
    }

    fn can_move_dir(&self, cell: u32, dir: u8) -> bool {
        if self.has_wall(cell, dir) { return false; }
        self.neighbor(cell, dir).is_some()
    }

    fn move_dir(&self, cell: u32, dir: u8) -> u32 {
        self.neighbor(cell, dir).unwrap_or(cell)
    }

    fn step_wall(&mut self) {
        let max_steps = self.rows * self.cols * 40;
        if self.solve_steps > max_steps {
            self.solve_done = true;
            return;
        }
        let mut cur = *self.solve_wall_path.last().unwrap_or(&self.start);
        if cur == self.goal {
            let path = self.solve_wall_path.clone();
            for c in path {
                self.solve[c as usize] |= SOLVE_PATH;
            }
            self.solve_done = true;
            return;
        }
        let dir = self.solve_wall_dir;
        let right = (dir + 1) % 4;
        let left = (dir + 3) % 4;
        let back = (dir + 2) % 4;
        let next_dir;
        if self.can_move_dir(cur, right) {
            next_dir = right;
        } else if !self.can_move_dir(cur, dir) {
            if self.can_move_dir(cur, left) { next_dir = left; }
            else if self.can_move_dir(cur, back) { next_dir = back; }
            else { self.solve_done = true; return; }
        } else {
            next_dir = dir;
        }
        self.solve_wall_dir = next_dir;
        cur = self.move_dir(cur, next_dir);
        self.solve_wall_path.push(cur);
        self.solve[cur as usize] |= SOLVE_VISITED | SOLVE_CURRENT;
        self.solve[cur as usize] &= !SOLVE_CURRENT;
        self.solve_steps += 1;
    }

    fn live_open_count(&self, cell: u32) -> u32 {
        let mut n = 0;
        for d in 0..4u8 {
            if !self.has_wall(cell, d) {
                if let Some(nn) = self.neighbor(cell, d) {
                    if self.solve[nn as usize] & SOLVE_DEAD == 0 {
                        n += 1;
                    }
                }
            }
        }
        n
    }

    fn step_deadend(&mut self) {
        let total = self.rows * self.cols;
        let mut changed = false;
        for i in 0..total {
            if self.solve[i as usize] & SOLVE_DEAD != 0 { continue; }
            if i == self.start || i == self.goal { continue; }
            if self.live_open_count(i) <= 1 {
                self.solve[i as usize] |= SOLVE_DEAD;
                changed = true;
            }
        }
        if !changed {
            for i in 0..total {
                if self.solve[i as usize] & SOLVE_DEAD == 0 {
                    self.solve[i as usize] |= SOLVE_PATH;
                }
            }
            self.solve_done = true;
        }
    }

    fn step_flood(&mut self) {
        if self.solve_qhead >= self.solve_queue.len() as u32 {
            self.solve_done = true;
            return;
        }
        let cur = self.solve_queue[self.solve_qhead as usize];
        self.solve_qhead += 1;
        self.solve[cur as usize] |= SOLVE_VISITED;
        if cur == self.goal {
            self.reconstruct_path();
            self.solve_done = true;
            return;
        }
        for n in self.open_neighbors(cur) {
            if self.solve[n as usize] & SOLVE_VISITED != 0 { continue; }
            self.solve[n as usize] |= SOLVE_VISITED;
            self.solve_parent[n as usize] = cur as i32;
            self.solve_queue.push(n);
        }
    }

    fn step_tremaux(&mut self) {
        if self.solve_tremaux.is_empty() {
            self.solve_done = true;
            return;
        }
        let cur = *self.solve_tremaux.last().unwrap();
        if cur == self.goal {
            let mut c = cur as i32;
            let mut guard = self.rows * self.cols;
            while c >= 0 && guard > 0 {
                self.solve[c as usize] |= SOLVE_PATH;
                if c as u32 == self.start { break; }
                c = self.solve_parent[c as usize];
                guard -= 1;
            }
            self.solve_done = true;
            return;
        }
        let mut open = Vec::new();
        for n in self.open_neighbors(cur) {
            if self.solve[n as usize] & SOLVE_VISITED == 0 {
                open.push(n);
            }
        }
        if open.is_empty() {
            self.solve_tremaux.pop();
            return;
        }
        let next = open[0];
        self.solve[next as usize] |= SOLVE_VISITED | SOLVE_CURRENT;
        self.solve[next as usize] &= !SOLVE_CURRENT;
        self.solve_parent[next as usize] = cur as i32;
        self.solve_tremaux.push(next);
    }

    pub fn solve_all(&mut self, kind: u8) {
        self.start_solve(kind);
        let max_steps = self.rows * self.cols * 8 + 64;
        let mut left = max_steps;
        while !self.solve_done && left > 0 {
            self.step_solve(4096);
            left = left.saturating_sub(4096);
        }
        self.clear_solve_current();
    }

    fn clear_solve_current(&mut self) {
        for s in self.solve.iter_mut() {
            *s &= !SOLVE_CURRENT;
        }
    }

    pub fn cells_ptr(&self) -> *const u8 { self.cells.as_ptr() }
    pub fn cells_len(&self) -> usize { self.cells.len() }
    pub fn solve_ptr(&self) -> *const u8 { self.solve.as_ptr() }
    pub fn solve_len(&self) -> usize { self.solve.len() }

    pub fn get_cells(&self) -> Vec<u8> { self.cells.clone() }
    pub fn get_solve(&self) -> Vec<u8> { self.solve.clone() }

    pub fn export_state(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.cells.len() + 24);
        out.extend_from_slice(&self.rows.to_le_bytes());
        out.extend_from_slice(&self.cols.to_le_bytes());
        out.extend_from_slice(&self.start.to_le_bytes());
        out.extend_from_slice(&self.goal.to_le_bytes());
        for c in &self.cells {
            out.push(c & WALL_ALL);
        }
        out
    }

    pub fn import_state(&mut self, data: &[u8]) -> bool {
        if data.len() < 16 { return false; }
        let rows = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        let cols = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
        let start = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
        let goal = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
        if rows < 1 || rows > 1000 || cols < 1 || cols > 1000 { return false; }
        let n = (rows * cols) as usize;
        if data.len() != 16 + n { return false; }

        self.set_size(rows, cols);
        for i in 0..n {
            self.cells[i] = (data[16 + i] & WALL_ALL) | if i as u32 == start || i as u32 == goal { 0 } else { 0 };
        }
        self.start = start.min(rows * cols - 1);
        self.goal = goal.min(rows * cols - 1);
        self.clear_gen_markers();
        self.clear_solve_markers();
        true
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    // nothing to do
  }
