// Always page through PostgREST's row cap before computing financial totals.
export async function ownedRows(db, table, uid, columns = '*') {
  const result = [];
  let after = null;
  for (;;) {
    let q = db
      .from(table)
      .select(columns)
      .eq('user_id', uid)
      .order('id')
      .limit(500);
    if (after) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) throw error;
    result.push(...data);
    if (!data.length) return result;
    after = data[data.length - 1].id;
  }
}
