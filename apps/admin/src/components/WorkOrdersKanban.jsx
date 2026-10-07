import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';
import { formatDate } from '@4s-clima/shared/utils';
import { supabase } from '@4s-clima/shared/supabase';

const COLUMNS = [
  { id: WORK_ORDER_STATUS.PENDING, title: 'Pendientes', color: 'border-blue-500 bg-blue-50' },
  { id: WORK_ORDER_STATUS.IN_PROGRESS, title: 'En Progreso', color: 'border-amber-500 bg-amber-50' },
  { id: WORK_ORDER_STATUS.COMPLETED, title: 'Completadas', color: 'border-emerald-500 bg-emerald-50' }
];

export default function WorkOrdersKanban({ initialOrders, onOrderUpdated }) {
  const [columns, setColumns] = useState({});

  useEffect(() => {
    // Group orders by status
    const newColumns = {
      [WORK_ORDER_STATUS.PENDING]: [],
      [WORK_ORDER_STATUS.IN_PROGRESS]: [],
      [WORK_ORDER_STATUS.COMPLETED]: [],
      [WORK_ORDER_STATUS.CANCELLED]: []
    };

    initialOrders.forEach(order => {
      if (newColumns[order.status]) {
        newColumns[order.status].push(order);
      }
    });

    setColumns(newColumns);
  }, [initialOrders]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStatus = source.droppableId;
    const destStatus = destination.droppableId;

    // Optimistic UI Update
    const newColumns = { ...columns };
    const sourceList = Array.from(newColumns[sourceStatus]);
    const destList = Array.from(newColumns[destStatus]);
    const [movedOrder] = sourceList.splice(source.index, 1);
    
    // update status locally
    movedOrder.status = destStatus;
    
    if (sourceStatus === destStatus) {
      sourceList.splice(destination.index, 0, movedOrder);
      newColumns[sourceStatus] = sourceList;
    } else {
      destList.splice(destination.index, 0, movedOrder);
      newColumns[sourceStatus] = sourceList;
      newColumns[destStatus] = destList;
    }

    setColumns(newColumns);

    try {
      // Update DB
      const updateData = { status: destStatus };
      if (destStatus === WORK_ORDER_STATUS.COMPLETED) {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', draggableId);

      if (error) throw error;
      if (onOrderUpdated) onOrderUpdated();
    } catch (err) {
      console.error('Error actualizando estado:', err);
      // Rollback might be needed here, but since onOrderUpdated is called it usually refreshes
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col md:flex-row gap-6 min-h-[600px] overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex-1 min-w-[300px] flex flex-col bg-gray-50 dark:bg-slate-900/40 rounded-xl border border-gray-200 dark:border-slate-700">
            <div className={`p-4 border-t-4 ${col.color.split(' ')[0]} rounded-t-xl bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700`}>
              <h3 className="font-bold text-gray-800 dark:text-white flex justify-between items-center">
                {col.title}
                <span className="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">
                  {columns[col.id]?.length || 0}
                </span>
              </h3>
            </div>
            
            <Droppable droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 p-3 transition-colors ${snapshot.isDraggingOver ? col.color.split(' ')[1] : ''}`}
                >
                  {columns[col.id]?.map((order, index) => (
                    <Draggable key={order.id} draggableId={order.id} index={index}>
                      {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white dark:bg-slate-800 p-4 mb-3 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 cursor-grab active:cursor-grabbing transition-shadow ${snapshot.isDragging ? 'shadow-lg border-brand-300' : 'hover:shadow-md'}`}
                          >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-mono font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                              #{order.order_number || order.id.slice(0, 8)}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(order.scheduled_date)}</span>
                          </div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-1 leading-tight">{order.client?.name || 'Cliente sin nombre'}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{order.plant?.name || 'Planta principal'}</p>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                                {order.assigned?.name?.charAt(0) || '?'}
                              </div>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                {order.assigned?.name || 'Sin asignar'}
                              </span>
                            </div>
                            
                            {/* Extras indicators */}
                            {order.extras && order.extras.filter(e => !e.billed).length > 0 && (
                              <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                                +Extras
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
