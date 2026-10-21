#!/usr/bin/env python3
"""Цифры за неделю для разбора — по тем же правилам, что дашборд.

    python3 tools/week_stats.py              # прошедшая неделя (пн–вс до текущего понедельника)
    python3 tools/week_stats.py 2026-10-12   # неделя с этого понедельника

Правила (как в assets/app.js):
- привычки ежедневные: сумма выполненных ÷ сумма привычек за неделю; прошедший день без отметки `h`
  (начиная с первого дня учёта привычек, до сегодня не включая) = 0 из N, N — размер списка на тот день;
- задачи: сумма сделанного ÷ сумма поставленного; `planned: 0` = день не распланирован = 0 из 1;
- зоны: < 50 красная, 50–75 голубая, ≥ 75 зелёная.
"""
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']


def zone(p):
    return None if p is None else 'green' if p >= 75 else 'blue' if p >= 50 else 'red'


def pct(a, b):
    return round(a / b * 100, 1) if b else None


def habit_count_on(days, habits, date):
    """Размер списка на дату — по ближайшей отметке, при равенстве по более поздней (как в app.js)."""
    d0 = dt.date.fromisoformat(date)
    marked = [(abs((dt.date.fromisoformat(d) - d0).days), d, r) for d, r in days.items() if d != date and r.get('h')]
    if not marked:
        return sum(h['active'] for h in habits) or 1
    dist = min(m[0] for m in marked)
    return len(max((m for m in marked if m[0] == dist), key=lambda m: m[1])[2]['h'])


def week(days, habits, start):
    dates = [(start + dt.timedelta(i)).isoformat() for i in range(7)]
    hab_start = min((d for d, r in days.items() if r.get('h')), default=None)
    today = dt.date.today().isoformat()
    unmarked = 0
    hd = ht = td = tt = noplan = 0
    per_day, per_habit = [], {}
    for i, d in enumerate(dates):
        r = days.get(d)
        row = {'date': d, 'wd': WD[i], 'habits': None, 'tasks': None}
        if r and r.get('h'):
            dd, t = sum(r['h'].values()), len(r['h'])
            hd += dd; ht += t
            row['habits'] = {'done': dd, 'of': t, 'pct': pct(dd, t)}
            for k, v in r['h'].items():
                s = per_habit.setdefault(k, [0, 0]); s[0] += v; s[1] += 1
        elif hab_start and hab_start <= d < today:      # не отметил = 0 из N
            t = habit_count_on(days, habits, d)
            ht += t; unmarked += 1
            row['habits'] = {'done': 0, 'of': t, 'pct': 0.0, 'unmarked': True}
        if r and r.get('planned') is not None:
            d_, p_ = (r.get('done', 0), r['planned']) if r['planned'] > 0 else (0, 1)
            if r['planned'] == 0:
                noplan += 1
            td += d_; tt += p_
            row['tasks'] = {'done': d_, 'of': p_, 'pct': pct(d_, p_)}
        per_day.append(row)
    names = {h['id']: h for h in habits}
    marked = [x for x in per_day if x['habits']]
    planned = [x for x in per_day if x['tasks']]
    return {
        'from': dates[0], 'to': dates[-1],
        'habits': {'done': hd, 'of': ht, 'pct': pct(hd, ht), 'zone': zone(pct(hd, ht)), 'days_marked': len(marked) - unmarked, 'days_unmarked': unmarked},
        'tasks': {'done': td, 'of': tt, 'pct': pct(td, tt), 'zone': zone(pct(td, tt)), 'days_logged': len(planned),
                  'days_unplanned': noplan,
                  'avg_planned': round(sum(x['tasks']['of'] for x in planned) / len(planned), 1) if planned else None},
        'per_habit': sorted(({'id': k, 'name': names.get(k, {}).get('name', k), 'active_now': names.get(k, {}).get('active'),
                              'done': v[0], 'of': v[1], 'pct': pct(v[0], v[1])} for k, v in per_habit.items()),
                            key=lambda x: (x['pct'], x['name'])),
        'per_day': per_day,
    }


def main():
    days = {x['date']: x for x in json.loads((ROOT / 'data/days.json').read_text())}
    habits = json.loads((ROOT / 'data/habits.json').read_text())
    if len(sys.argv) > 1:
        start = dt.date.fromisoformat(sys.argv[1])
    else:
        today = dt.date.today()
        start = today - dt.timedelta(today.weekday() + 7)
    assert start.weekday() == 0, 'неделя начинается с понедельника'
    cur, prev = week(days, habits, start), week(days, habits, start - dt.timedelta(7))
    print(json.dumps({'week': cur, 'prev_week': prev,
                      'active_habits_now': [h['name'] for h in habits if h['active']]}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
