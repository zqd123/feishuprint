import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable, FieldType, IFieldMeta, ITable, IView } from '@lark-base-open/js-sdk';
import { Button, Card, Divider, Radio, Select, Space, Spin, Typography, message, Switch, Tooltip, Checkbox, Input, Modal } from 'antd';
import 'antd/dist/reset.css';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType } from 'docx';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Title, Text } = Typography;

// 类型定义
type FieldOption = { label: string; value: string };
type RecordRange = 'all' | 'visible' | 'selected';
type SortDirection = 'asc' | 'desc' | 'none';

interface UserPreferences {
  selectedFieldIds: string[];
  orderedFieldIds: string[];
  recordRange: RecordRange;
  sortFieldId?: string;
  sortDirection: SortDirection;
  useViewOrder: boolean;
  customTitle?: string;
  showIndexColumn: boolean;
}

interface Template {
  id: string;
  name: string;
  selectedFieldIds: string[];
  orderedFieldIds: string[];
  customTitle?: string;
  showIndexColumn: boolean;
  createdAt: number;
  tableId?: string; // 新增：关联的数据表ID
}

// 可拖拽字段项组件（包含复选框）
const SortableFieldItem: React.FC<{ 
  id: string; 
  label: string; 
  checked: boolean; 
  onCheck: (id: string, checked: boolean) => void;
}> = ({ id, label, checked, onCheck }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: '1px solid #ddd',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 8,
    background: checked ? '#f6ffed' : '#fff',
    borderColor: checked ? '#52c41a' : '#ddd',
    cursor: 'grab',
    boxShadow: isDragging ? '0 2px 8px rgba(0,0,0,0.15)' : undefined,
    opacity: isDragging ? 0.85 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
  
  const handleCheckboxChange = (e: any) => {
    e.stopPropagation();
    onCheck(id, e.target.checked);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1 }} {...attributes} {...listeners}>
        <span style={{ marginLeft: 8 }}>{label}</span>
      </div>
      <Checkbox 
        checked={checked} 
        onChange={handleCheckboxChange}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
};

function App() {
  const [loading, setLoading] = useState(false);
  const [table, setTable] = useState<ITable | null>(null);
  const [view, setView] = useState<IView | null>(null);
  const [fieldMetas, setFieldMetas] = useState<IFieldMeta[]>([]);
  const [tableRecordIds, setTableRecordIds] = useState<string[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [orderedFieldIds, setOrderedFieldIds] = useState<string[]>([]);
  const [recordRange, setRecordRange] = useState<RecordRange>('visible');
  const [sortFieldId, setSortFieldId] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('none');
  const [useViewOrder, setUseViewOrder] = useState(true);
  // 记录当前活动表 id，用于判断是否切换了数据表
  const lastTableIdRef = useRef<string | null>(null);
  const [currentTableId, setCurrentTableId] = useState<string>(''); // 新增：当前表ID状态

  // 新增状态
  const [customTitle, setCustomTitle] = useState<string>('导出数据');
  const [showIndexColumn, setShowIndexColumn] = useState<boolean>(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [templateName, setTemplateName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // dnd-kit 传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 筛选出当前数据表的模板
  const filteredTemplates = useMemo(() => {
    if (!currentTableId) return templates;
    return templates.filter(t => t.tableId === currentTableId);
  }, [templates, currentTableId]);

  // 当筛选后的模板变化时，自动选择第一个模板
  useEffect(() => {
    if (filteredTemplates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(filteredTemplates[0].id);
    } else if (filteredTemplates.length === 0) {
      setSelectedTemplateId('');
    } else if (selectedTemplateId && !filteredTemplates.some(t => t.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0]?.id || '');
    }
  }, [filteredTemplates, selectedTemplateId]);

  // 初始化：表、视图、字段、记录
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const t = await bitable.base.getActiveTable();
        setTable(t);
        // 尝试从 SDK 对象读取 tableId（不同版本字段名可能差异）
        let currentTid = '';
        try {
          // @ts-ignore
          const tid: string | undefined = (t as any)?.id || (t as any)?.tableId || (await (t as any)?.getId?.());
          if (tid) {
            lastTableIdRef.current = tid;
            currentTid = tid;
            setCurrentTableId(tid); // 设置当前表ID状态
          }
        } catch {}
        let v: IView | null = null;
        try {
          v = await t.getActiveView();
        } catch {}
        setView(v);
        const metas = await t.getFieldMetaList();
        setFieldMetas(metas);
        const ids = await t.getRecordIdList();
        setTableRecordIds(ids);
        let defaultFieldIds = metas.map(m => m.id);
        if (v) {
          try {
            const visibleFieldIds = await (v as any).getVisibleFieldIdList?.();
            if (Array.isArray(visibleFieldIds) && visibleFieldIds.length) {
              defaultFieldIds = visibleFieldIds;
            }
          } catch {}
        }
        setSelectedFieldIds(defaultFieldIds);
        setOrderedFieldIds(metas.map(m => m.id));
        await loadPreferences(defaultFieldIds, metas.map(m => m.id));
      } catch (e: any) {
        message.error('初始化失败：' + e?.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);
  // 监听飞书多维表格的选择变化，如果检测到切换了数据表，则刷新页面
  useEffect(() => {
    const off = (bitable as any)?.base?.onSelectionChange?.((e: any) => {
      const newTableId: string | null = e?.tableId || e?.data?.tableId || null;
      if (!newTableId) return;
      if (lastTableIdRef.current === null) {
        lastTableIdRef.current = newTableId;
        return;
      }
      if (lastTableIdRef.current !== newTableId) {
        // 为确保所有状态与字段重新根据新表加载，这里做一次全量刷新
        window.location.reload();
      }
    });
    return () => {
      try { off && off(); } catch {}
    };
  }, []);

  // 可选字段选项
  const fieldOptions: FieldOption[] = useMemo(
    () => fieldMetas.map(m => ({ label: m.name, value: m.id })),
    [fieldMetas]
  );

  // 读取/保存偏好（使用 localStorage）
  const PREF_KEY = 'export_print_prefs_v1';
  const TEMPLATE_KEY = 'export_print_templates_v1';
  
  const loadPreferences = async (fallbackFieldIds: string[], availableFieldIds: string[]) => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw) as Partial<UserPreferences>;
      // 过滤无效字段ID（使用当前可用字段ID集合，避免依赖尚未同步到位的 fieldMetas 状态）
      const valid = new Set(availableFieldIds);
      if (prefs.selectedFieldIds) {
        const filtered = prefs.selectedFieldIds.filter(id => valid.has(id));
        setSelectedFieldIds(filtered.length ? filtered : fallbackFieldIds);
      }
      if (prefs.orderedFieldIds) {
        const filteredOrder = prefs.orderedFieldIds.filter(id => valid.has(id));
        setOrderedFieldIds(filteredOrder.length ? filteredOrder : availableFieldIds);
      }
      if (prefs.recordRange) setRecordRange(prefs.recordRange);
      if (prefs.sortFieldId !== undefined) setSortFieldId(prefs.sortFieldId);
      if (prefs.sortDirection) setSortDirection(prefs.sortDirection);
      if (typeof prefs.useViewOrder === 'boolean') setUseViewOrder(prefs.useViewOrder);
      if (prefs.customTitle) setCustomTitle(prefs.customTitle);
      if (typeof prefs.showIndexColumn === 'boolean') setShowIndexColumn(prefs.showIndexColumn);
    } catch {}
  };
  
  const savePreferences = async () => {
    try {
      const prefs: UserPreferences = {
        selectedFieldIds,
        orderedFieldIds,
        recordRange,
        sortFieldId: sortFieldId || undefined,
        sortDirection,
        useViewOrder,
        customTitle,
        showIndexColumn,
      };
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {}
  };
  
  // 加载模板
  const loadTemplates = () => {
    try {
      const raw = localStorage.getItem(TEMPLATE_KEY);
      if (raw) {
        const temps = JSON.parse(raw) as Template[];
        setTemplates(temps);
      }
    } catch {}
  };
  
  // 保存模板
  const saveTemplate = () => {
    if (!templateName.trim()) {
      message.error('请输入模板名称');
      return;
    }
    const template: Template = {
      id: Date.now().toString(),
      name: templateName.trim(),
      selectedFieldIds: [...selectedFieldIds],
      orderedFieldIds: [...orderedFieldIds],
      customTitle,
      showIndexColumn,
      createdAt: Date.now(),
      tableId: currentTableId, // 关联当前数据表ID
    };
    const newTemplates = [...templates, template];
    setTemplates(newTemplates);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(newTemplates));
    setShowTemplateModal(false);
    setTemplateName('');
    message.success('模板保存成功');
  };
  
  // 应用模板
  const applyTemplate = (template: Template) => {
    const valid = new Set(fieldMetas.map(f => f.id));
    const filteredSelected = template.selectedFieldIds.filter(id => valid.has(id));
    const filteredOrdered = template.orderedFieldIds.filter(id => valid.has(id));
    
    setSelectedFieldIds(filteredSelected.length ? filteredSelected : fieldMetas.map(f => f.id));
    setOrderedFieldIds(filteredOrdered.length ? filteredOrdered : fieldMetas.map(f => f.id));
    setCustomTitle(template.customTitle || '导出数据');
    setShowIndexColumn(template.showIndexColumn);
    message.success('模板应用成功');
  };
  
  // 删除模板
  const deleteTemplate = (templateId: string) => {
    const newTemplates = templates.filter(t => t.id !== templateId);
    setTemplates(newTemplates);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(newTemplates));
    message.success('模板删除成功');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      savePreferences();
    }, 400);
    return () => clearTimeout(timer);
  }, [selectedFieldIds, orderedFieldIds, recordRange, sortFieldId, sortDirection, useViewOrder, customTitle, showIndexColumn]);

  // 初始化时加载模板
  useEffect(() => {
    loadTemplates();
  }, []);

  // 字段复选框变更
  const handleFieldCheck = (fieldId: string, checked: boolean) => {
    if (checked) {
      setSelectedFieldIds(prev => [...prev, fieldId]);
    } else {
      setSelectedFieldIds(prev => prev.filter(id => id !== fieldId));
    }
  };

  // 拖拽结束，调整字段顺序
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedFieldIds(prev => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // 主动刷新字段元信息（兜底）
  const refreshFieldMetas = async () => {
    if (!table) return;
    try {
      const metas = await table.getFieldMetaList();
      setFieldMetas(metas);
      if (!selectedFieldIds.length) setSelectedFieldIds(metas.map(m => m.id));
      if (!orderedFieldIds.length) setOrderedFieldIds(metas.map(m => m.id));
      message.success('字段已刷新');
    } catch (e: any) {
      message.error('刷新字段失败：' + (e?.message || '未知错误'));
    }
  };

  // 计算最终字段顺序（结合视图顺序）
  const getEffectiveHeaderIds = async () => {
    const chosen = new Set(selectedFieldIds);
    let ids = orderedFieldIds.filter(id => chosen.has(id));
    if (useViewOrder && view) {
      try {
        const visible = await (view as any).getVisibleFieldIdList?.();
        if (Array.isArray(visible) && visible.length) {
          const visibleChosen = visible.filter((id: string) => chosen.has(id));
          const others = ids.filter(id => !visibleChosen.includes(id));
          ids = [...visibleChosen, ...others];
        }
      } catch {}
    }
    return ids;
  };

  // 获取记录范围（结合视图顺序与选择）
  const getEffectiveRecordIds = async () => {
    if (!table) return [] as string[];
    let ids: string[] = [];
    if (recordRange === 'all') {
      ids = await table.getRecordIdList();
    } else if (recordRange === 'visible' && view) {
      try {
        const vis = await (view as any).getVisibleRecordIdList?.();
        if (Array.isArray(vis) && vis.length) ids = vis; else ids = await table.getRecordIdList();
      } catch {
        ids = await table.getRecordIdList();
      }
    } else if (recordRange === 'selected' && view) {
      try {
        const sel = await (view as any).getSelectedRecordIdList?.();
        if (Array.isArray(sel) && sel.length) {
          ids = sel;
        } else if (selectedRecordIds.length) {
          ids = selectedRecordIds;
        } else {
          const vis = await (view as any).getVisibleRecordIdList?.();
          ids = Array.isArray(vis) ? vis : await table.getRecordIdList();
        }
      } catch {
        ids = selectedRecordIds.length ? selectedRecordIds : await table.getRecordIdList();
      }
    } else {
      ids = await table.getRecordIdList();
    }

    if (sortDirection !== 'none' && sortFieldId) {
      ids = await sortRecordIds(ids, sortFieldId, sortDirection);
    }
    return ids;
  };

  // 字段值格式化（根据字段类型和值结构进行精确格式化）
  const formatValue = (val: any, fieldMeta?: IFieldMeta) => {
    if (val === null || val === undefined) return '';
    
    // 根据字段类型进行专门的格式化
    if (fieldMeta?.type) {
      switch (fieldMeta.type) {
        case FieldType.User: // 人员字段
        case FieldType.CreatedUser: // 创建人
        case FieldType.ModifiedUser: // 修改人
          if (Array.isArray(val)) {
            return val.map(user => {
              if (typeof user === 'object' && user) {
                return user.name || user.enName || user.email || user.id || '未知用户';
              }
              return String(user);
            }).join(', ');
          } else if (typeof val === 'object' && val) {
            return val.name || val.enName || val.email || val.id || '未知用户';
          }
          break;
          
        case FieldType.Attachment: // 附件字段
          if (Array.isArray(val)) {
            return val.map(attachment => {
              if (typeof attachment === 'object' && attachment) {
                return attachment.name || attachment.token || '附件';
              }
              return String(attachment);
            }).join(', ');
          } else if (typeof val === 'object' && val && val.name) {
            return val.name;
          }
          break;
          
        case FieldType.SingleLink: // 单向关联字段
        case FieldType.DuplexLink: // 双向关联字段
          if (typeof val === 'object' && val && val.recordIds) {
            if (Array.isArray(val.recordIds)) {
              return `关联记录(${val.recordIds.length}条)`;
            }
          }
          break;
          
        case FieldType.DateTime: // 日期字段
        case FieldType.CreatedTime: // 创建时间
        case FieldType.ModifiedTime: // 修改时间
          if (typeof val === 'number') {
            return new Date(val).toLocaleString('zh-CN');
          }
          break;
          
        case FieldType.SingleSelect: // 单选字段
          if (typeof val === 'object' && val && val.text) {
            return val.text;
          }
          break;
          
        case FieldType.MultiSelect: // 多选字段
          if (Array.isArray(val)) {
            return val.map(option => {
              if (typeof option === 'object' && option && option.text) {
                return option.text;
              }
              return String(option);
            }).join(', ');
          }
          break;
          
        case FieldType.Checkbox: // 复选框
          return val ? '是' : '否';
          
        case FieldType.Currency: // 货币字段
          if (typeof val === 'number') {
            return val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
          if (typeof val === 'object' && val) {
            const amount = typeof val.amount === 'number' ? val.amount : undefined;
            const code = typeof val.code === 'string' ? val.code : (typeof val.currency === 'string' ? val.currency : undefined);
            if (typeof amount === 'number') {
              const num = amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return code ? `${num} ${code}` : num;
            }
          }
          break;
          
        case FieldType.Rating: // 评分字段
          if (typeof val === 'number') {
            return `${val}星`;
          }
          break;
          
        case FieldType.Progress: // 进度条
          if (typeof val === 'number') {
            const pct = val <= 1 && val >= 0 ? Math.round(val * 100) : Math.round(val);
            return `${pct}%`;
          }
          break;
          
        case FieldType.Url: // 超链接字段
          if (typeof val === 'object' && val) {
            return val.text || val.link || String(val);
          }
          if (typeof val === 'string') return val;
          break;
          
        case FieldType.Location: // 地理位置
          if (typeof val === 'object' && val) {
            return val.address || val.fullAddress || `经纬度: ${val.longitude || '?'}, ${val.latitude || '?'}`;
          }
          break;
          
        case FieldType.Email: // 邮箱字段
        case FieldType.Phone: // 电话字段
        case FieldType.Text: // 多行文本
        case FieldType.Number: // 数字
          // 这些类型通常直接返回字符串或数字，走通用处理
          break;
          
        case FieldType.Formula: // 公式字段
        case FieldType.Lookup: // 查找引用字段
          // 这些字段的值可能是复合类型，需要特殊处理，暂时走通用处理
          break;
      }
    }
    
    // 通用格式化逻辑（兼容旧版本和未覆盖的类型）
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    if (Array.isArray(val)) {
      return val.map(v => {
        if (typeof v === 'string' || typeof v === 'number') return String(v);
        if (typeof v === 'object' && v) {
          // 优先使用 text 属性，然后是 name，最后是 JSON
          return v.text || v.name || JSON.stringify(v);
        }
        return String(v);
      }).join(', ');
    }
    if (typeof val === 'object' && val) {
      // 优先使用 text 属性，然后是 name，最后是 JSON
      if ('text' in val && typeof val.text === 'string') return val.text;
      if ('name' in val && typeof val.name === 'string') return val.name;
      return JSON.stringify(val);
    }
    return String(val);
  };

  // 记录排序
  const sortRecordIds = async (ids: string[], fieldId: string, dir: SortDirection) => {
    if (!table) return ids;
    const field = await table.getField(fieldId);
    const meta = await field.getMeta();
    const pairs: { id: string; v: any }[] = [];
    for (const id of ids) {
      try {
        const v = await field.getValue(id);
        pairs.push({ id, v });
      } catch {
        pairs.push({ id, v: undefined });
      }
    }
    pairs.sort((a, b) => {
      const va = formatValue(a.v, meta);
      const vb = formatValue(b.v, meta);
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return pairs.map(p => p.id);
  };

  // 导出 Word
  const exportWord = async () => {
    if (!table) return;
    setLoading(true);
    try {
      const headers = await getEffectiveHeaderIds();
      const headerCells: TableCell[] = [];
      
      // 添加序号列表头
      if (showIndexColumn) {
        headerCells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '序号', bold: true })] })] }));
      }
      
      // 添加字段列表头
      headers.forEach(hid => {
        const fieldName = fieldMetas.find(f => f.id === hid)?.name || '';
        headerCells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: fieldName, bold: true })] })] }));
      });

      const ids = await getEffectiveRecordIds();
      const rows: TableRow[] = [];
      for (let i = 0; i < ids.length; i++) {
        const rid = ids[i];
        const cells: TableCell[] = [];
        
        // 添加序号列
        if (showIndexColumn) {
          cells.push(new TableCell({ children: [new Paragraph((i + 1).toString())] }));
        }
        
        // 添加字段数据列
        for (const fid of headers) {
          const field = await table.getField(fid);
          const val = await field.getValue(rid);
          const fm = fieldMetas.find(f => f.id === fid);
          const text = formatValue(val, fm);
          cells.push(new TableCell({ children: [new Paragraph(text)] }));
        }
        rows.push(new TableRow({ children: cells }));
      }

      const tableDoc = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: headerCells }), ...rows]
      });

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: customTitle, bold: true, size: 28 })] }),
              tableDoc
            ]
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${customTitle}.docx`);
      message.success('Word 导出成功');
    } catch (e: any) {
      message.error('导出失败：' + e?.message);
    } finally {
      setLoading(false);
    }
  };

  // 打印
  const printNow = async () => {
    if (!table) return;
    setLoading(true);
    try {
      const headers = await getEffectiveHeaderIds();
      const ids = await getEffectiveRecordIds();
      let html = '<html><head><meta charset="utf-8"/><title>打印</title><style>table{border-collapse:collapse;width:100%;}th,td{border:1px solid #999;padding:6px;}th{background:#f5f5f5;}h2{text-align:center;margin:0 0 12px 0;}</style></head><body>';
      html += `<h2>${customTitle}</h2><table><thead><tr>`;
      
      // 添加序号列表头
      if (showIndexColumn) {
        html += '<th>序号</th>';
      }
      
      // 添加字段列表头
      headers.forEach(h => {
        const fieldName = fieldMetas.find(f => f.id === h)?.name || '';
        html += `<th>${fieldName}</th>`;
      });
      
      html += '</tr></thead><tbody>';
      
      for (let i = 0; i < ids.length; i++) {
        const rid = ids[i];
        html += '<tr>';
        
        // 添加序号列
        if (showIndexColumn) {
          html += `<td>${i + 1}</td>`;
        }
        
        // 添加字段数据列
        for (const fid of headers) {
          const field = await table.getField(fid);
          const val = await field.getValue(rid);
          const fm = fieldMetas.find(f => f.id === fid);
          const text = formatValue(val, fm);
          html += `<td>${text}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></body></html>';

      const win = window.open('', '_blank');
      if (!win) throw new Error('浏览器拦截了新窗口');
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
      message.success('已打开打印窗口');
    } catch (e: any) {
      message.error('打印失败：' + e?.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 16 }}><Spin /> 初始化中...</div>;

  return (
    <div style={{ padding: 16, paddingBottom: 88 }}>
      <Title level={4}>导出 / 打印当前数据表</Title>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="范围与顺序">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text style={{ marginRight: 8 }}>自定义标题</Text>
              <Input 
                placeholder="输入导出/打印标题"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
            <div>
              <Text style={{ marginRight: 8 }}>显示序号列</Text>
              <Switch checked={showIndexColumn} onChange={setShowIndexColumn} />
            </div>
            <div>
              <Text style={{ marginRight: 8 }}>记录范围</Text>
              <Radio.Group
                value={recordRange}
                onChange={e => setRecordRange(e.target.value)}
              >
                <Radio.Button value="visible">当前视图可见</Radio.Button>
                <Radio.Button value="selected">视图选中</Radio.Button>
                <Radio.Button value="all">整表</Radio.Button>
              </Radio.Group>
            </div>
            <div>
              <Text style={{ marginRight: 8 }}>字段顺序</Text>
              <Switch checked={useViewOrder} onChange={setUseViewOrder} />
              <Text style={{ marginLeft: 8 }}>跟随视图</Text>
            </div>
            <div>
              <Text style={{ marginRight: 8 }}>记录排序</Text>
              <Select
                allowClear
                placeholder="选择排序字段"
                style={{ minWidth: 220 }}
                value={sortFieldId || undefined}
                onChange={v => setSortFieldId(v || '')}
                options={fieldOptions}
              />
              <Radio.Group
                style={{ marginLeft: 8 }}
                value={sortDirection}
                onChange={e => setSortDirection(e.target.value)}
              >
                <Radio.Button value="none">无</Radio.Button>
                <Radio.Button value="asc">升序</Radio.Button>
                <Radio.Button value="desc">降序</Radio.Button>
              </Radio.Group>
            </div>
          </Space>
        </Card>

        <Modal
          title="保存模板"
          open={showTemplateModal}
          onOk={() => saveTemplate()}
          onCancel={() => setShowTemplateModal(false)}
          okText="保存"
          cancelText="取消"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text style={{ marginRight: 8 }}>模板名称</Text>
              <Input
                placeholder="请输入模板名称"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{ width: 240 }}
              />
            </div>
            <Text type="secondary">
              将保存当前字段选择与顺序、自定义标题以及序号列显示设置。
            </Text>
          </Space>
        </Modal>

        <Card size="small" title="拖拽选择与排序字段（拖拽调整字段顺序，勾选复选框选择导出字段）">
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary">提示：拖拽项目可调整顺序，勾选右侧复选框可选择是否导出该字段</Text>
          </div>
          {fieldMetas.length === 0 || orderedFieldIds.length === 0 ? (
            <div style={{ padding: 12, background: '#fafafa', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
              <Space>
                <Text type="secondary">未获取到字段，请点击</Text>
                <Button size="small" onClick={refreshFieldMetas}>刷新字段</Button>
                <Text type="secondary">或稍后重试</Text>
              </Space>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={orderedFieldIds} strategy={verticalListSortingStrategy}>
                {orderedFieldIds.map(fid => (
                  <SortableFieldItem 
                    key={fid} 
                    id={fid} 
                    label={fieldMetas.find(f => f.id === fid)?.name || fid}
                    checked={selectedFieldIds.includes(fid)}
                    onCheck={handleFieldCheck}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </Card>

        {/* 操作按钮已迁移到底部固定工具栏 */}
      </Space>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: '12px 16px',
          zIndex: 100,
        }}
      >
        <Space wrap>
          <Button onClick={() => setShowTemplateModal(true)}>保存模板</Button>
          <Select
            placeholder="选择模板应用"
            style={{ minWidth: 220 }}
            allowClear
            value={selectedTemplateId || undefined}
            onChange={(value) => {
              setSelectedTemplateId(value || '');
              if (value) {
                const t = filteredTemplates.find(t => t.id === value);
                if (t) applyTemplate(t);
              }
            }}
            options={filteredTemplates.map(t => ({ label: t.name, value: t.id }))}
          />
          <Button
            danger
            disabled={!selectedTemplateId}
            onClick={() => {
              if (!selectedTemplateId) return;
              deleteTemplate(selectedTemplateId);
              setSelectedTemplateId('');
            }}
          >删除模板</Button>
          <Divider type="vertical" />
          <Button type="primary" onClick={exportWord}>导出 Word</Button>
          <Button onClick={printNow}>打印</Button>
        </Space>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);